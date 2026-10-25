import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuditedTransaction } from '../audit/audited-transaction';
import { PrismaService } from '../database/prisma.service';
import {
  ABSOLUTE_TIMEOUT_MS,
  burnPasswordCheck,
  hashToken,
  IDLE_TIMEOUT_MS,
  type LoginInput,
  MAX_FAILED_LOGINS,
  newSessionToken,
  verifyPassword,
} from './credentials';

export interface SessionUser {
  sessionId: string;
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

const INVALID = 'Credenciais inválidas';

// Uma única definição de "sessão ativa", usada no login e nas listagens
const active = (now: number) => ({
  revokedAt: null,
  expiresAt: { gt: new Date(now) },
  lastSeenAt: { gt: new Date(now - IDLE_TIMEOUT_MS) },
});
const SESSION_FIELDS = { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ip: true, userAgent: true } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly audited: AuditedTransaction,
  ) {}

  async login(input: LoginInput, client: { ip?: string; userAgent?: string }): Promise<string> {
    // lower(email) usa o índice único de expressão criado na migration do iam
    const [user] = await this.prisma.$queryRaw<
      { id: string; password_hash: string; status: string; locked: boolean }[]
    >`SELECT id, password_hash, status::text, coalesce(locked_until > now(), false) AS locked
        FROM iam.users WHERE lower(email) = ${input.email}`;

    if (!user) {
      await burnPasswordCheck(input.password);
      return this.deny(null, 'credenciais_invalidas');
    }
    if (user.locked) {
      await this.audit.record({ action: 'auth.login', outcome: 'DENIED', actorId: user.id, reason: 'conta_bloqueada' });
      throw new HttpException('Conta temporariamente bloqueada. Tente novamente em alguns minutos.', HttpStatus.LOCKED);
    }
    const valid = await verifyPassword(user.password_hash, input.password);
    if (user.status !== 'ACTIVE') return this.deny(user.id, 'conta_desativada');
    if (!valid) return this.registerFailure(user.id);
    // ACL só depois da senha certa: quem não sabe a senha não descobre que existe regra de IP ou horário
    const [rule] = await this.prisma.$queryRaw<{ action: string; rule_id: string }[]>`
      SELECT action::text, rule_id FROM iam.login_acl_decision(${user.id}::uuid, ${client.ip ?? null}::inet)`;
    if (rule?.action === 'DENY') {
      await this.audit.record({ action: 'auth.login', outcome: 'DENIED', actorId: user.id, reason: 'acl_negado', metadata: { regra: rule.rule_id } });
      throw new ForbiddenException('Login não permitido deste local ou horário');
    }

    const token = newSessionToken();
    await this.audited.run({ action: 'auth.login', actorId: user.id, resourceType: 'session' }, async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS),
          ip: client.ip ?? null,
          userAgent: client.userAgent?.slice(0, 256) ?? null,
        },
      });
    });
    return token;
  }

  async resolveSession(token: string): Promise<SessionUser | null> {
    const now = Date.now();
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: hashToken(token),
        ...active(now),
        user: { status: 'ACTIVE' },
      },
      // Papéis e permissões vêm na mesma consulta: mudança de papel vale já na próxima requisição
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            roles: { select: { role: { select: { code: true, permissions: { select: { permissionCode: true } } } } } },
          },
        },
      },
    });
    if (!session) return null;
    // Atualiza no máximo uma vez por minuto: sem isso, toda requisição viraria uma escrita no banco
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.updateMany({
        where: { id: session.id, lastSeenAt: { lt: new Date(now - 60_000) } },
        data: { lastSeenAt: new Date(now) },
      });
    }
    const { roles, ...user } = session.user;
    const permissions = new Set(roles.flatMap((r) => r.role.permissions.map((p) => p.permissionCode)));
    return { sessionId: session.id, ...user, roles: roles.map((r) => r.role.code).sort(), permissions: [...permissions].sort() };
  }

  async logout(sessionId: string): Promise<void> {
    await this.audited.run({ action: 'auth.logout', resourceType: 'session', resourceId: sessionId }, (tx) =>
      tx.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } }),
    );
  }

  listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, ...active(Date.now()) },
      select: SESSION_FIELDS,
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  // Filtra também pelo dono: sessão de outra pessoa responde 404, sem revelar que existe
  async revokeOwnSession(userId: string, sessionId: string): Promise<void> {
    await this.audited.run({ action: 'auth.session_revoke', resourceType: 'session', resourceId: sessionId }, async (tx) => {
      const { count } = await tx.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      if (count === 0) throw new NotFoundException('Sessão não encontrada');
    });
  }

  async revokeAllSessions(userId: string) {
    const target = { action: 'iam.sessions_revoke', resourceType: 'user', resourceId: userId, metadata: {} as Record<string, number> };
    return this.audited.run(target, async (tx) => {
      const { count } = await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      target.metadata = { sessoes_revogadas: count };
      return { revokedSessions: count };
    });
  }

  // Incremento atômico no banco: tentativas simultâneas não se perdem (sem "lost update")
  private async registerFailure(userId: string): Promise<never> {
    const [row] = await this.prisma.$queryRaw<{ failed_login_count: number; just_locked: boolean }[]>`
      UPDATE iam.users
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE WHEN failed_login_count + 1 >= ${MAX_FAILED_LOGINS}
                                 THEN now() + interval '15 minutes' ELSE locked_until END,
             updated_at = now()
       WHERE id = ${userId}::uuid
   RETURNING failed_login_count, failed_login_count >= ${MAX_FAILED_LOGINS} AS just_locked`;
    await this.audit.record({ action: 'auth.login', outcome: 'DENIED', actorId: userId, reason: 'senha_incorreta' });
    if (row?.just_locked) {
      await this.audit.record({
        action: 'auth.account_locked',
        outcome: 'SUCCESS',
        actorId: userId,
        reason: `${MAX_FAILED_LOGINS}_falhas_seguidas`,
      });
    }
    throw new UnauthorizedException(INVALID);
  }

  private async deny(actorId: string | null, reason: string): Promise<never> {
    await this.audit.record({ action: 'auth.login', outcome: 'DENIED', actorId, reason });
    throw new UnauthorizedException(INVALID);
  }
}
