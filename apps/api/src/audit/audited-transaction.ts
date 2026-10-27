import { Injectable, Logger } from '@nestjs/common';
import { currentContext } from '../common/correlation-id';
import { PrismaService, setActor, type Tx } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { type AuditEntry, AuditService } from './audit.service';
import { describeFailure, sqlStateOf } from './failure';

// Deadlock (40P01) e falha de serialização (40001) são transitórios: refazer a transação inteira resolve
const RETRYABLE = new Set(['40P01', '40001']);
const MAX_ATTEMPTS = 3;
const isRetryable = (err: unknown) =>
  RETRYABLE.has(sqlStateOf(err) ?? '') || (err as { code?: string })?.code === 'P2034';

export type AuditTarget = Omit<AuditEntry, 'outcome' | 'reason'>;

export interface TransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

@Injectable()
export class AuditedTransaction {
  private readonly logger = new Logger(AuditedTransaction.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // O target é lido depois do trabalho: o chamador pode completar metadata (ex.: diff antes/depois)
  async run<T>(
    target: AuditTarget,
    work: (tx: Tx) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.attempt(target, work, options);
      } catch (err) {
        if (attempt < MAX_ATTEMPTS && isRetryable(err)) {
          this.logger.warn(
            `${target.action}: ${sqlStateOf(err) ?? 'conflito'} na tentativa ${attempt}, refazendo`,
          );
          // Espera aleatória: as duas vítimas não voltam no mesmo instante e colidem de novo
          await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
          continue;
        }
        await this.recordFailure(target, err);
        throw err;
      }
    }
  }

  private async attempt<T>(
    target: AuditTarget,
    work: (tx: Tx) => Promise<T>,
    options: TransactionOptions,
  ): Promise<T> {
    const label = `dbwatch:${currentContext()?.correlationId ?? 'interno'}`;
    // A cadeia de hash exige READ COMMITTED; em outros níveis o sucesso é gravado após o COMMIT
    const auditInside = (options.isolationLevel ?? 'ReadCommitted') === 'ReadCommitted';
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Identifica a transação em pg_stat_activity; o true limita o valor a esta transação
        await tx.$executeRaw`SELECT set_config('application_name', ${label}, true)`;
        await setActor(tx);
        const value = await work(tx);
        // Sucesso na mesma transação: ou a ação e o registro são confirmados juntos, ou nenhum
        if (auditInside) await this.audit.record({ ...target, outcome: 'SUCCESS' }, tx);
        return value;
      },
      { isolationLevel: options.isolationLevel },
    );
    if (!auditInside) await this.audit.record({ ...target, outcome: 'SUCCESS' });
    return result;
  }

  // Fora da transação que falhou: dentro dela, o ROLLBACK apagaria justamente o registro da falha
  private async recordFailure(target: AuditTarget, err: unknown): Promise<void> {
    try {
      await this.audit.record({ ...target, ...describeFailure(err) });
    } catch (auditErr) {
      const name = auditErr instanceof Error ? auditErr.name : 'erro';
      this.logger.error(`Falha ao auditar ${target.action}: ${name}`);
    }
  }
}
