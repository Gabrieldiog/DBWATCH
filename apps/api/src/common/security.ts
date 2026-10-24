import type { NextFunction, Request, Response } from 'express';
import { getCorrelationId } from './correlation-id';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // A API só devolve JSON; o Swagger UI é a única página e precisa dos próprios scripts
  if (!req.path.startsWith('/api/docs')) res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
}

// CSRF: o cookie é SameSite=Strict, e ainda assim toda requisição que altera estado precisa vir do nosso front
export function originCheck(allowedOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method) || req.header('origin') === allowedOrigin) return next();
    res.status(403).json({ statusCode: 403, message: 'Origem não permitida', correlationId: getCorrelationId(req) });
  };
}

// Janela fixa em memória: suficiente para uma instância única (a VPS do projeto)
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      if (this.hits.size > 10_000) this.sweep(t);
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  private sweep(t: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= t) this.hits.delete(key);
  }
}
