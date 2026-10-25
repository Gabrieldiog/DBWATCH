import { Injectable, NotFoundException } from '@nestjs/common';
import { type AuditTarget, AuditedTransaction } from '../audit/audited-transaction';
import { hashPassword } from '../auth/credentials';
import { PrismaService, type Tx } from '../database/prisma.service';
import { toHttpError } from './db-errors';
import type { NewUser } from './users.schemas';

const PUBLIC_FIELDS = { id: true, email: true, displayName: true, status: true, lastLoginAt: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audited: AuditedTransaction,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { email: 'asc' },
      select: { ...PUBLIC_FIELDS, roles: { select: { role: { select: { code: true } } } } },
    });
    return users.map(({ roles, ...u }) => ({ ...u, roles: roles.map((r) => r.role.code).sort() }));
  }

  async create(input: NewUser) {
    const passwordHash = await hashPassword(input.password);
    return this.run({ action: 'iam.user_create', resourceType: 'user', resourceId: input.email }, (tx) =>
      tx.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash }, select: PUBLIC_FIELDS }),
    );
  }

  // Desativar revoga todas as sessões na mesma transação: ou as duas coisas acontecem, ou nenhuma
  async setStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    const target: AuditTarget = { action: 'iam.user_status', resourceType: 'user', resourceId: id };
    return this.run(target, async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: { status: true } });
      if (!before) throw new NotFoundException('Usuário não encontrado');
      await tx.user.update({ where: { id }, data: { status } });
      const { count } = status === 'DISABLED'
        ? await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
        : { count: 0 };
      target.metadata = { status_antes: before.status, status_depois: status, sessoes_revogadas: count };
      return { id, status, revokedSessions: count };
    });
  }

  async assignRole(userId: string, role: string, actorId: string) {
    const target = { action: 'iam.role_assign', resourceType: 'user', resourceId: userId, metadata: { papel: role } };
    await this.run(target, async (tx) => {
      const { id } = await this.roleId(tx, role);
      await tx.userRole.create({ data: { userId, roleId: id, grantedById: actorId } });
    }, 'O usuário já tem esse papel');
  }

  async removeRole(userId: string, role: string) {
    const target = { action: 'iam.role_remove', resourceType: 'user', resourceId: userId, metadata: { papel: role } };
    await this.run(target, async (tx) => {
      const { id } = await this.roleId(tx, role);
      const { count } = await tx.userRole.deleteMany({ where: { userId, roleId: id } });
      if (count === 0) throw new NotFoundException('O usuário não tem esse papel');
    });
  }

  private async roleId(tx: Tx, code: string) {
    const role = await tx.role.findUnique({ where: { code }, select: { id: true } });
    if (!role) throw new NotFoundException('Papel inexistente');
    return role;
  }

  private async run<T>(target: AuditTarget, work: (tx: Tx) => Promise<T>, conflict = 'Já existe um usuário com esse e-mail'): Promise<T> {
    try {
      return await this.audited.run(target, work);
    } catch (err) {
      throw toHttpError(err, conflict);
    }
  }
}
