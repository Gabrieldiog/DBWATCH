import {
  BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, ServiceUnavailableException,
} from '@nestjs/common';
import { escapeIdentifier, Pool, type QueryConfig, type QueryResult } from 'pg';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { ENV, PrismaService } from '../database/prisma.service';

const MAX_ROWS = 100;
const DENIALS: Record<string, string> = {
  sem_concessao: 'Você não tem acesso a este recurso; peça um com o nível Leitura ou Escrita',
  grant_expired: 'Seu acesso a este recurso expirou; peça de novo',
  grant_revoked: 'Seu acesso a este recurso foi revogado',
  grant_not_started: 'Seu acesso a este recurso ainda não começou',
};

export type ConsoleResult = { level: 'READ' | 'WRITE'; command: string; rowCount: number; columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; durationMs: number };

// PK-21/PK-23: o console SQL. Quem limita o que o comando pode fazer é o banco-alvo: o papel do recurso (dbwatch_rw_*)
// só alcança a tabela daquele recurso, sem DDL, e com acesso de Leitura a transação nasce READ ONLY, então qualquer
// escrita volta com o erro do próprio PostgreSQL. A API confere o acesso, manda um comando por vez, com tempo-limite,
// e grava o comando inteiro na auditoria
@Injectable()
export class ConsoleService implements OnModuleDestroy {
  private readonly target?: Pool;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) env: Env,
  ) {
    if (!env.TARGET_DATABASE_URL) return;
    this.target = new Pool({ connectionString: env.TARGET_DATABASE_URL, max: 3, application_name: 'dbwatch-console', connectionTimeoutMillis: 2_000 });
    const logger = new Logger(ConsoleService.name);
    this.target.on('error', (err) => logger.error(`Conexão do console falhou: ${err.message}`));
  }

  async execute(resourceId: string, userId: string, sql: string): Promise<ConsoleResult> {
    if (!this.target) throw new ServiceUnavailableException('Banco-alvo não configurado');
    const resource = await this.prisma.resource.findUnique({ where: { id: resourceId }, select: { id: true, writeRole: true } });
    if (!resource) throw new NotFoundException('Recurso não encontrado');
    if (!resource.writeRole) throw new ForbiddenException('Este recurso não tem console SQL');

    // Mesma regra das consultas: vale a concessão mais recente, com o estado pelo relógio do banco. A EXCLUDE impede
    // duas vivas no mesmo recurso, então o nível dela decide se a transação pode escrever
    const [grant] = await this.prisma.asActor((tx) => tx.$queryRaw<{ id: string; level: 'READ' | 'WRITE'; state: string }[]>`
      SELECT id, access_level::text AS level, CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED' WHEN now() >= expires_at THEN 'EXPIRED'
                      WHEN now() < starts_at THEN 'SCHEDULED' ELSE 'ACTIVE' END AS state
        FROM pam.access_grants WHERE user_id = ${userId}::uuid AND resource_id = ${resource.id}::uuid
       ORDER BY starts_at DESC LIMIT 1`);
    const denial = !grant ? 'sem_concessao' : ({ EXPIRED: 'grant_expired', REVOKED: 'grant_revoked', SCHEDULED: 'grant_not_started' } as Record<string, string>)[grant.state];
    const target = { action: 'pam.console_execute', resourceType: 'resource', resourceId: resource.id };
    if (denial || !grant) {
      await this.audit.record({ ...target, outcome: 'DENIED', reason: denial, metadata: { comando: sql } });
      throw new ForbiddenException(DENIALS[denial ?? 'sem_concessao']);
    }

    const started = performance.now();
    let result: Omit<ConsoleResult, 'level' | 'durationMs'> | undefined;
    let failure: { sqlstate: string; message: string } | undefined;
    const client = await this.target.connect();
    try {
      // READ WRITE vence o default_transaction_read_only do papel de leitura; READ ONLY não pode ser desfeito depois
      // do primeiro comando (25001), e os comandos abaixo já vêm antes do da pessoa. SET LOCAL some no fim da transação
      await client.query(grant.level === 'WRITE' ? 'BEGIN READ WRITE' : 'BEGIN READ ONLY');
      await client.query(`SET LOCAL ROLE ${escapeIdentifier(resource.writeRole)}`);
      await client.query("SELECT set_config('statement_timeout', '3000', true), set_config('lock_timeout', '3000', true)");
      // extended: o protocolo aceita um comando só; "UPDATE ...; DROP ..." vira erro de sintaxe do próprio banco
      // queryMode existe no pg 8.11+, mas a tipagem ainda não declara
      const res: QueryResult = await client.query({ text: sql, queryMode: 'extended' } as QueryConfig);
      await client.query('COMMIT');
      const rows = (res.rows ?? []) as Record<string, unknown>[];
      result = { command: res.command, rowCount: res.rowCount ?? rows.length, columns: (res.fields ?? []).map((f) => f.name), rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const e = err as { code?: string; message?: string };
      failure = { sqlstate: e.code ?? 'XX000', message: e.message ?? 'erro' };
    } finally {
      // A conexão vai fora: nenhum SET feito pelo comando sobrevive para o próximo usuário
      client.release(true);
    }
    const durationMs = Math.round(performance.now() - started);
    await this.audit.record({
      ...target, outcome: failure ? 'FAILURE' : 'SUCCESS', reason: failure && `sqlstate:${failure.sqlstate}`,
      metadata: { comando: sql, nivel: grant.level, concessao: grant.id, linhas: result?.rowCount ?? 0, ms: durationMs },
    });
    // A mensagem é do PostgreSQL sobre o comando da própria pessoa (ex.: "permission denied for table pedidos")
    if (failure) throw new BadRequestException(`O banco recusou (SQLSTATE ${failure.sqlstate}): ${failure.message}`);
    return { level: grant.level, ...result!, durationMs };
  }

  async onModuleDestroy(): Promise<void> {
    await this.target?.end();
  }
}
