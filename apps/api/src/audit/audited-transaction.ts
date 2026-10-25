import { Injectable, Logger } from '@nestjs/common';
import { currentContext } from '../common/correlation-id';
import { PrismaService, type Tx } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { type AuditEntry, AuditService } from './audit.service';
import { describeFailure } from './failure';

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
  async run<T>(target: AuditTarget, work: (tx: Tx) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    const label = `dbwatch:${currentContext()?.correlationId ?? 'interno'}`;
    // A cadeia de hash exige READ COMMITTED; em outros níveis o sucesso é gravado após o COMMIT
    const auditInside = (options.isolationLevel ?? 'ReadCommitted') === 'ReadCommitted';
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Identifica a transação em pg_stat_activity; o true limita o valor a esta transação
          await tx.$executeRaw`SELECT set_config('application_name', ${label}, true)`;
          const value = await work(tx);
          // Sucesso na mesma transação: ou a ação e o registro são confirmados juntos, ou nenhum
          if (auditInside) await this.audit.record({ ...target, outcome: 'SUCCESS' }, tx);
          return value;
        },
        { isolationLevel: options.isolationLevel },
      );
      if (!auditInside) await this.audit.record({ ...target, outcome: 'SUCCESS' });
      return result;
    } catch (err) {
      await this.recordFailure(target, err);
      throw err;
    }
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
