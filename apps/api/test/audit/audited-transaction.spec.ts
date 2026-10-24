import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AuditService } from '../../src/audit/audit.service';
import { AuditedTransaction } from '../../src/audit/audited-transaction';
import { runWithContext } from '../../src/common/correlation-id';
import { loadEnv } from '../../src/config/env';
import { PrismaService } from '../../src/database/prisma.service';
import { urlFor } from '../support/db';

type Row = { outcome: string; reason: string | null; ip: string | null };

describe('AuditedTransaction (Nest + Prisma + PostgreSQL real)', () => {
  let prisma: PrismaService;
  let audited: AuditedTransaction;
  let audit: AuditService;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadEnv({ DATABASE_URL: urlFor('dbwatch_app') }))],
    }).compile();
    await moduleRef.init();
    [prisma, audited, audit] = [moduleRef.get(PrismaService), moduleRef.get(AuditedTransaction), moduleRef.get(AuditService)];
    close = () => moduleRef.close();
  });
  afterAll(() => close());

  const newUser = (email = `u-${randomUUID()}@dbwatch.test`) => ({ email, displayName: 'Teste', passwordHash: 'h' });
  const auditRows = (correlationId: string) =>
    prisma.$queryRaw<Row[]>`SELECT outcome::text, reason, host(ip) AS ip FROM audit.audit_log
                            WHERE correlation_id = ${correlationId}::uuid ORDER BY chain_position`;
  const inRequest = <T>(fn: () => Promise<T>) => {
    const correlationId = randomUUID();
    return { correlationId, done: runWithContext({ correlationId, ip: '203.0.113.7' }, fn) };
  };

  it('T-INT-08 sucesso: ação e auditoria confirmadas juntas, com correlation_id, IP e application_name', async () => {
    const data = newUser();
    let appName = '';
    const { correlationId, done } = inRequest(() =>
      audited.run({ action: 'user.create', resourceType: 'user' }, async (tx) => {
        appName = (await tx.$queryRaw<{ n: string }[]>`SELECT current_setting('application_name') AS n`)[0]!.n;
        return tx.user.create({ data });
      }),
    );
    await done;
    expect(appName).toBe(`dbwatch:${correlationId}`);
    expect(await prisma.user.count({ where: { email: data.email } })).toBe(1);
    expect(await auditRows(correlationId)).toEqual([{ outcome: 'SUCCESS', reason: null, ip: '203.0.113.7' }]);
  });

  it('T-INT-08 se a ação falha depois de gravar, o ROLLBACK desfaz tudo e só a falha fica registrada', async () => {
    const data = newUser();
    const { correlationId, done } = inRequest(() =>
      audited.run({ action: 'user.create' }, async (tx) => {
        await tx.user.create({ data });
        throw new Error('falha simulada depois do INSERT');
      }),
    );
    await expect(done).rejects.toThrow('falha simulada');
    expect(await prisma.user.count({ where: { email: data.email } })).toBe(0);
    expect(await auditRows(correlationId)).toEqual([{ outcome: 'FAILURE', reason: 'Error', ip: '203.0.113.7' }]);
  });

  it('T-INT-09 erro do banco: a falha sobrevive ao ROLLBACK com SQLSTATE e constraint, sem dados da linha', async () => {
    const data = newUser('email-invalido');
    const { correlationId, done } = inRequest(() =>
      audited.run({ action: 'user.create' }, (tx) => tx.user.create({ data })),
    );
    await expect(done).rejects.toThrow();
    const rows = await auditRows(correlationId);
    expect(rows).toEqual([{ outcome: 'FAILURE', reason: 'sqlstate:23514 users_email_format_ck', ip: '203.0.113.7' }]);
    expect(JSON.stringify(rows)).not.toContain('email-invalido');
  });

  it('negação de permissão é registrada como DENIED', async () => {
    const { correlationId, done } = inRequest(() =>
      audited.run({ action: 'role.assign' }, async () => {
        throw new ForbiddenException();
      }),
    );
    await expect(done).rejects.toThrow(ForbiddenException);
    expect((await auditRows(correlationId))[0]).toMatchObject({ outcome: 'DENIED', reason: 'http:403' });
  });

  it('metadado sensível impede a operação inteira (sem auditoria, sem ação)', async () => {
    const data = newUser();
    const { done } = inRequest(() =>
      audited.run({ action: 'user.create', metadata: { password: 'x' } }, (tx) => tx.user.create({ data })),
    );
    await expect(done).rejects.toThrow(/Metadado proibido.*password/);
    expect(await prisma.user.count({ where: { email: data.email } })).toBe(0);
  });

  it('em SERIALIZABLE o sucesso é auditado depois do COMMIT', async () => {
    const { correlationId, done } = inRequest(() =>
      audited.run({ action: 'lab.check' }, async (tx) => tx.$queryRaw`SELECT 1`, { isolationLevel: 'Serializable' }),
    );
    await done;
    expect((await auditRows(correlationId))[0]).toMatchObject({ outcome: 'SUCCESS' });
  });

  it('verify() confirma a cadeia íntegra', async () => {
    const report = await audit.verify();
    expect(report.firstBrokenPosition).toBeNull();
    expect(report.checked).toBeGreaterThan(0);
  });
});
