import { Injectable } from '@nestjs/common';
import { currentContext } from '../common/correlation-id';
import { PrismaService, type Tx } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';
export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditEntry {
  action: string;
  outcome: AuditOutcome;
  actorId?: string | null;
  resourceType?: string;
  resourceId?: string;
  reason?: string;
  metadata?: AuditMetadata;
}

export interface ChainReport {
  checked: number;
  firstBrokenPosition: number | null;
}

export interface AuditFilter {
  limit: number;
  cursor?: number;
  action?: string;
  outcome?: AuditOutcome;
  actorId?: string;
  resourceId?: string;
  correlationId?: string;
  from?: string;
  to?: string;
}

const SENSITIVE_KEY = /pass|senha|token|secret|segredo|cookie|authorization|hash/i;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Com tx: grava junto com a ação. Sem tx: grava numa transação própria (usada nas falhas)
  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    const metadata = entry.metadata ?? {};
    const leaked = Object.keys(metadata).find((key) => SENSITIVE_KEY.test(key));
    if (leaked) throw new Error(`Metadado proibido na auditoria: ${leaked}`);

    const context = currentContext();
    // Sem ator explícito, usa o usuário da sessão; null explícito marca ação anônima (ex.: login falho)
    const actorId = entry.actorId !== undefined ? entry.actorId : (context?.userId ?? null);
    const db = tx ?? this.prisma;
    await db.$executeRaw`
      INSERT INTO audit.audit_log
        (actor_id, action, resource_type, resource_id, outcome, reason, correlation_id, ip, metadata)
      VALUES (
        ${actorId}::uuid, ${entry.action}, ${entry.resourceType ?? null},
        ${entry.resourceId ?? null}, ${entry.outcome}::audit.audit_outcome, ${entry.reason ?? null},
        ${context?.correlationId ?? null}::uuid, ${context?.ip ?? null}::inet,
        ${JSON.stringify(metadata)}::jsonb
      )`;
  }

  // Paginação por cursor (chain_position): estável mesmo com novas linhas chegando, ao contrário de OFFSET
  async list(f: AuditFilter) {
    const where = [Prisma.sql`TRUE`];
    if (f.cursor !== undefined) where.push(Prisma.sql`a.chain_position < ${f.cursor}`);
    if (f.action) where.push(Prisma.sql`a.action = ${f.action}`);
    if (f.outcome) where.push(Prisma.sql`a.outcome = ${f.outcome}::audit.audit_outcome`);
    if (f.actorId) where.push(Prisma.sql`a.actor_id = ${f.actorId}::uuid`);
    if (f.resourceId) where.push(Prisma.sql`a.resource_id = ${f.resourceId}`);
    if (f.correlationId) where.push(Prisma.sql`a.correlation_id = ${f.correlationId}::uuid`);
    if (f.from) where.push(Prisma.sql`a.occurred_at >= ${f.from}::timestamptz`);
    if (f.to) where.push(Prisma.sql`a.occurred_at < ${f.to}::timestamptz`);
    const rows = await this.prisma.$queryRaw<{ chainPosition: bigint }[]>`
      SELECT a.chain_position AS "chainPosition", a.occurred_at AS "occurredAt", a.actor_id AS "actorId",
             u.email AS "actorEmail", a.action, a.resource_type AS "resourceType", a.resource_id AS "resourceId",
             a.outcome::text AS outcome, a.reason, a.correlation_id AS "correlationId", host(a.ip) AS ip, a.metadata
        FROM audit.audit_log a LEFT JOIN iam.users u ON u.id = a.actor_id
       WHERE ${Prisma.join(where, ' AND ')}
       ORDER BY a.chain_position DESC
       LIMIT ${f.limit + 1}`;
    const items = rows.slice(0, f.limit).map((r) => ({ ...r, chainPosition: Number(r.chainPosition) }));
    return { items, nextCursor: rows.length > f.limit ? items.at(-1)!.chainPosition : null };
  }

  async verify(): Promise<ChainReport> {
    const [row] = await this.prisma.$queryRaw<
      { checked: bigint; first_broken_position: bigint | null }[]
    >`SELECT checked, first_broken_position FROM audit.verify_chain()`;
    const broken = row?.first_broken_position;
    return { checked: Number(row?.checked ?? 0), firstBrokenPosition: broken == null ? null : Number(broken) };
  }
}
