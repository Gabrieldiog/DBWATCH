import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { setContextUser } from '../common/correlation-id';
import type { Env } from '../config/env';
import { ENV } from '../database/prisma.service';
import { AuthService, type SessionUser } from './auth.service';
import { readCookie, sessionCookieName } from './credentials';
import { REQUIRED_PERMISSIONS } from './permissions';
import { IS_PUBLIC } from './public.decorator';

const users = new WeakMap<Request, SessionUser>();

export function currentUser(req: Request): SessionUser {
  const user = users.get(req);
  if (!user) throw new UnauthorizedException('Sessão inválida ou expirada');
  return user;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_PERMISSIONS, targets);
    const req = context.switchToHttp().getRequest<Request>();
    const token = readCookie(req.header('cookie'), sessionCookieName(this.env.NODE_ENV === 'production'));
    const user = token ? await this.auth.resolveSession(token) : null;
    if (!user) throw new UnauthorizedException('Sessão inválida ou expirada');
    users.set(req, user);
    setContextUser(user.id, user.permissions);
    // Rota sem declaração nenhuma é tratada como proibida: esquecer o decorator nunca abre acesso
    const missing = required === undefined ? ['rota_sem_permissao'] : required.filter((p) => !user.permissions.includes(p));
    if (missing.length === 0) return true;
    await this.audit.record({
      action: 'authz.denied',
      outcome: 'DENIED',
      resourceType: 'route',
      resourceId: `${req.method} ${req.path}`.slice(0, 120),
      reason: missing.join(',').slice(0, 200),
    });
    throw new ForbiddenException('Permissão insuficiente');
  }
}
