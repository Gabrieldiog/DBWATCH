import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-request-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ids = new WeakMap<Request, string>();

export interface RequestContext {
  correlationId: string;
  ip?: string;
  userId?: string;
}

// Leva o contexto da requisição até a auditoria sem passar parâmetro por todas as camadas
const storage = new AsyncLocalStorage<RequestContext>();

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_HEADER);
  // Só aceita UUID vindo do cliente: impede injeção de texto arbitrário nos logs
  const id = incoming && UUID.test(incoming) ? incoming.toLowerCase() : randomUUID();
  ids.set(req, id);
  res.setHeader(CORRELATION_HEADER, id);
  storage.run({ correlationId: id, ip: req.ip }, next);
}

export function getCorrelationId(req: Request): string {
  return ids.get(req) ?? 'desconhecido';
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

// Chamado pelo guard de sessão: a partir daqui, a auditoria sabe quem é o autor
export function setContextUser(userId: string): void {
  const store = storage.getStore();
  if (store) store.userId = userId;
}

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}
