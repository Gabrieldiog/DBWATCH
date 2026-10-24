import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { describeFailure, sqlStateOf } from '../../src/audit/failure';

const prismaError = (code: string, message: string) => ({
  code: 'P2010',
  message: 'Raw query failed',
  meta: {
    driverAdapterError: {
      cause: { originalCode: code, originalMessage: message, detail: 'Failing row contains (..., $argon2id$segredo, ...)' },
    },
  },
});

describe('sqlStateOf (unitário)', () => {
  it('extrai o SQLSTATE de um erro do Prisma com driver adapter', () => {
    expect(sqlStateOf(prismaError('23505', 'duplicate key'))).toBe('23505');
  });

  it('aceita o código de um erro direto do pg', () => {
    expect(sqlStateOf({ code: '40P01' })).toBe('40P01');
  });

  it('não confunde código do Prisma com SQLSTATE', () => {
    expect(sqlStateOf({ code: 'P2002' })).toBeUndefined();
    expect(sqlStateOf(new Error('x'))).toBeUndefined();
    expect(sqlStateOf(undefined)).toBeUndefined();
  });
});

describe('describeFailure (unitário)', () => {
  it('403 e 401 viram DENIED; outros HTTP viram FAILURE', () => {
    expect(describeFailure(new ForbiddenException())).toEqual({ outcome: 'DENIED', reason: 'http:403' });
    expect(describeFailure(new ConflictException())).toEqual({ outcome: 'FAILURE', reason: 'http:409' });
  });

  it('erro de banco registra SQLSTATE e constraint, nunca o DETAIL', () => {
    const err = prismaError('23514', 'new row violates check constraint "users_email_format_ck"');
    const result = describeFailure(err);
    expect(result).toEqual({ outcome: 'FAILURE', reason: 'sqlstate:23514 users_email_format_ck' });
    expect(JSON.stringify(result)).not.toMatch(/argon2|segredo|Failing row/);
  });

  it('erro sem SQLSTATE registra só o tipo do erro', () => {
    expect(describeFailure(new TypeError('dados do usuário aqui'))).toEqual({ outcome: 'FAILURE', reason: 'TypeError' });
  });
});
