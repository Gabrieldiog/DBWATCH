import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';

// Parâmetros mínimos do OWASP para Argon2id; ficam gravados no próprio hash
const ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const IDLE_TIMEOUT_MS = 30 * 60_000;
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60_000;
export const MAX_FAILED_LOGINS = 5;

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password: z.string().min(1).max(200),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

let dummyHash: Promise<string> | undefined;
// Usuário inexistente também paga o custo do Argon2: o tempo de resposta não revela quem existe
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await argon2.verify(await dummyHash, password);
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(token).digest());
}

export function sessionCookieName(production: boolean): string {
  // O prefixo __Host- obriga Secure, Path=/ e nenhum Domain; em http://localhost de desenvolvimento não dá
  return production ? '__Host-dbwatch_session' : 'dbwatch_session';
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || undefined;
  }
  return undefined;
}
