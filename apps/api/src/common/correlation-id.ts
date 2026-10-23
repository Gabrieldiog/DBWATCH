import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-request-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ids = new WeakMap<Request, string>();

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_HEADER);
  // Só aceita UUID vindo do cliente: impede injeção de texto arbitrário nos logs
  const id = incoming && UUID.test(incoming) ? incoming.toLowerCase() : randomUUID();
  ids.set(req, id);
  res.setHeader(CORRELATION_HEADER, id);
  next();
}

export function getCorrelationId(req: Request): string {
  return ids.get(req) ?? 'desconhecido';
}
