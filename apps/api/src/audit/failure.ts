import { HttpException, HttpStatus } from '@nestjs/common';
import type { AuditOutcome } from './audit.service';

type DriverCause = { originalCode?: unknown; code?: unknown; originalMessage?: unknown };
type ErrorShape = { code?: unknown; message?: unknown; meta?: { driverAdapterError?: { cause?: DriverCause } } };

const SQLSTATE = /^[0-9A-Z]{5}$/;
// Códigos do próprio Prisma (P1xxx a P6xxx) também têm 5 caracteres, mas não são SQLSTATE
const PRISMA_CODE = /^P[1-9]\d{3}$/;

export function sqlStateOf(err: unknown): string | undefined {
  const e = err as ErrorShape | undefined;
  const cause = e?.meta?.driverAdapterError?.cause;
  const fromDriver = cause?.originalCode ?? cause?.code;
  if (typeof fromDriver === 'string' && SQLSTATE.test(fromDriver)) return fromDriver;
  const top = e?.code;
  return typeof top === 'string' && SQLSTATE.test(top) && !PRISMA_CODE.test(top) ? top : undefined;
}

// Nunca usa a mensagem inteira nem o DETAIL do PostgreSQL: eles trazem a linha, inclusive hashes de senha
export function describeFailure(err: unknown): { outcome: AuditOutcome; reason: string } {
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const denied = status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN;
    return { outcome: denied ? 'DENIED' : 'FAILURE', reason: `http:${status}` };
  }
  const sqlState = sqlStateOf(err);
  if (!sqlState) return { outcome: 'FAILURE', reason: err instanceof Error ? err.name : 'erro' };
  const e = err as ErrorShape;
  const message = e.meta?.driverAdapterError?.cause?.originalMessage ?? e.message;
  const constraint = typeof message === 'string' ? /constraint "([a-z0-9_]+)"/.exec(message)?.[1] : undefined;
  return { outcome: 'FAILURE', reason: constraint ? `sqlstate:${sqlState} ${constraint}` : `sqlstate:${sqlState}` };
}
