import { randomBytes } from 'node:crypto';
import type { AuditedTransaction } from '../audit/audited-transaction';
import { hashPassword } from './credentials';

export const DEMO_USERS = [
  { email: 'ana.admin@dbwatch.test', displayName: 'Ana Admin', role: 'ADMIN' },
  { email: 'bruno.aprovador@dbwatch.test', displayName: 'Bruno Aprovador', role: 'APPROVER' },
  { email: 'carla.aprovadora@dbwatch.test', displayName: 'Carla Aprovadora', role: 'APPROVER' },
  { email: 'diego.solicitante@dbwatch.test', displayName: 'Diego Solicitante', role: 'REQUESTER' },
  { email: 'eva.auditora@dbwatch.test', displayName: 'Eva Auditora', role: 'AUDITOR' },
] as const;

export interface SeededUser {
  email: string;
  role: string;
  password: string;
  created: boolean;
}

// Idempotente: recria o que falta e gera senha nova (também destrava a conta) para quem já existe
export async function seedDemoUsers(audited: AuditedTransaction): Promise<SeededUser[]> {
  const prepared = await Promise.all(
    DEMO_USERS.map(async (u) => {
      const password = randomBytes(12).toString('base64url');
      return { ...u, password, hash: await hashPassword(password) };
    }),
  );
  return audited.run({ action: 'iam.seed_demo', resourceType: 'user', metadata: { users: prepared.length } }, async (tx) => {
    const result: SeededUser[] = [];
    for (const u of prepared) {
      const existing = await tx.user.findFirst({ where: { email: { equals: u.email, mode: 'insensitive' } } });
      const reset = { passwordHash: u.hash, status: 'ACTIVE' as const, failedLoginCount: 0, lockedUntil: null };
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: reset })
        : await tx.user.create({ data: { email: u.email, displayName: u.displayName, ...reset } });
      const role = await tx.role.findUniqueOrThrow({ where: { code: u.role } });
      await tx.userRole.createMany({ data: [{ userId: user.id, roleId: role.id }], skipDuplicates: true });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      result.push({ email: u.email, role: u.role, password: u.password, created: !existing });
    }
    return result;
  });
}
