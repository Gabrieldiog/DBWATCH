import {
  BadRequestException, BadGatewayException, ForbiddenException, GatewayTimeoutException, Inject, Injectable, Logger,
  NotFoundException, type OnModuleDestroy, ServiceUnavailableException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { ENV, PrismaService } from '../database/prisma.service';

type Param = { name: string; type: 'text' | 'int' };
type Template = { code: string; resourceId: string; sqlText: string; params: unknown; maxRows: number; timeoutMs: number };

const DENIALS: Record<string, string> = {
  sem_concessao: 'Você não tem concessão para este recurso',
  grant_expired: 'Sua concessão expirou; peça acesso de novo',
  grant_revoked: 'Sua concessão foi revogada',
  grant_not_started: 'Sua concessão ainda não começou',
};

// Cada template declara seus parâmetros; o corpo da requisição precisa bater exatamente com eles
function parseParams(spec: unknown, raw: unknown): Record<string, string | number> {
  const fields = spec as Param[];
  const shape = Object.fromEntries(
    fields.map((f) => [f.name, f.type === 'int' ? z.number().int().min(0).max(10_000) : z.string().trim().min(1).max(100)]),
  );
  const parsed = z.object(shape).strict().safeParse(raw ?? {});
  if (!parsed.success) throw new BadRequestException('Parâmetros inválidos para esta consulta');
  return parsed.data as Record<string, string | number>;
}

@Injectable()
export class QueriesService implements OnModuleDestroy {
  private readonly target?: Pool;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) env: Env,
  ) {
    if (!env.TARGET_DATABASE_URL) return;
    this.target = new Pool({ connectionString: env.TARGET_DATABASE_URL, max: 5, application_name: 'dbwatch-consultas', connectionTimeoutMillis: 2_000 });
    const logger = new Logger(QueriesService.name);
    this.target.on('error', (err) => logger.error(`Conexão com o banco-alvo falhou: ${err.message}`));
  }

  catalog() {
    return this.prisma.queryTemplate.findMany({
      select: { code: true, title: true, accessLevel: true, params: true, maxRows: true, resource: { select: { id: true, name: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async execute(code: string, userId: string, rawParams: unknown) {
    if (!this.target) throw new ServiceUnavailableException('Banco-alvo não configurado');
    const template = await this.prisma.queryTemplate.findUnique({ where: { code } });
    if (!template) throw new NotFoundException('Consulta não encontrada no catálogo');
    const params = parseParams(template.params, rawParams);

    // A concessão mais recente do usuário para o recurso decide; o estado vem do relógio do banco (ADR-010)
    const [grant] = await this.prisma.asActor((tx) => tx.$queryRaw<{ id: string; state: string }[]>`
      SELECT id, CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED' WHEN now() >= expires_at THEN 'EXPIRED'
                      WHEN now() < starts_at THEN 'SCHEDULED' ELSE 'ACTIVE' END AS state
        FROM pam.access_grants WHERE user_id = ${userId}::uuid AND resource_id = ${template.resourceId}::uuid
       ORDER BY starts_at DESC LIMIT 1`);
    const denial = !grant ? 'sem_concessao' : ({ EXPIRED: 'grant_expired', REVOKED: 'grant_revoked', SCHEDULED: 'grant_not_started' } as Record<string, string>)[grant.state];
    if (denial || !grant) {
      await this.audit.record({ action: 'pam.query_execute', outcome: 'DENIED', resourceType: 'query_template', resourceId: code, reason: denial });
      throw new ForbiddenException(DENIALS[denial ?? 'sem_concessao']);
    }

    const started = performance.now();
    let result: Awaited<ReturnType<QueriesService['run']>> | undefined;
    let sqlstate: string | undefined;
    try {
      result = await this.run(template, Object.values(params));
    } catch (err) {
      sqlstate = (err as { code?: string }).code ?? 'XX000';
    }
    const durationMs = Math.round(performance.now() - started);
    // Execução e auditoria juntas, inclusive quando a consulta falha: o histórico não tem buraco
    await this.prisma.asActor(async (tx) => {
      await tx.queryExecution.create({
        data: { templateCode: code, grantId: grant.id, userId, params, outcome: sqlstate ? 'FAILURE' : 'SUCCESS', sqlstate, rowCount: result?.rowCount, durationMs },
      });
      await this.audit.record({
        action: 'pam.query_execute', outcome: sqlstate ? 'FAILURE' : 'SUCCESS', resourceType: 'query_template', resourceId: code,
        reason: sqlstate && `sqlstate:${sqlstate}`, metadata: { concessao: grant.id, linhas: result?.rowCount ?? 0, ms: durationMs },
      }, tx);
    });
    if (sqlstate === '57014') throw new GatewayTimeoutException('A consulta passou do tempo-limite e foi cancelada pelo banco');
    if (sqlstate) throw new BadGatewayException('Falha ao executar a consulta no banco-alvo');
    return { ...result, durationMs };
  }

  // Transação somente leitura, papel somente leitura e tempo-limite do template; o SQL vem do catálogo, os valores vão como $n
  private async run(t: Template, values: (string | number)[]) {
    const client = await this.target!.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SELECT set_config('statement_timeout', $1, true)", [String(t.timeoutMs)]);
      const res = await client.query({ text: `SELECT * FROM (${t.sqlText}) AS consulta LIMIT $${values.length + 1}`, values: [...values, t.maxRows + 1] });
      await client.query('COMMIT');
      const rows = res.rows.slice(0, t.maxRows);
      return { columns: res.fields.map((f) => f.name), rows, rowCount: rows.length, truncated: res.rows.length > t.maxRows };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.target?.end();
  }
}
