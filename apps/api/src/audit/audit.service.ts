import { Injectable } from '@nestjs/common';
import { currentContext } from '../common/correlation-id';
import { PrismaService, type Tx } from '../database/prisma.service';

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

  async verify(): Promise<ChainReport> {
    const [row] = await this.prisma.$queryRaw<
      { checked: bigint; first_broken_position: bigint | null }[]
    >`SELECT checked, first_broken_position FROM audit.verify_chain()`;
    const broken = row?.first_broken_position;
    return { checked: Number(row?.checked ?? 0), firstBrokenPosition: broken == null ? null : Number(broken) };
  }
}
