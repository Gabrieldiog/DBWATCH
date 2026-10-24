import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { setContextUser } from '../common/correlation-id';
import type { Env } from '../config/env';
import { ENV } from '../database/prisma.service';
import { AuthService, type SessionUser } from './auth.service';
import { readCookie, sessionCookieName } from './credentials';
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
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const token = readCookie(req.header('cookie'), sessionCookieName(this.env.NODE_ENV === 'production'));
    const user = token ? await this.auth.resolveSession(token) : null;
    if (!user) throw new UnauthorizedException('Sessão inválida ou expirada');
    users.set(req, user);
    setContextUser(user.id);
    return true;
  }
}
