import { describe, expect, it } from 'vitest';
import { hashToken, loginSchema, newSessionToken, readCookie, sessionCookieName } from '../../src/auth/credentials';
import { RateLimiter } from '../../src/common/security';

describe('credenciais e utilitários de sessão', () => {
  it('token de sessão tem 256 bits e o hash guardado tem 32 bytes', () => {
    const token = newSessionToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(newSessionToken()).not.toBe(token);
    expect(hashToken(token)).toHaveLength(32);
    expect(Buffer.from(hashToken(token)).equals(Buffer.from(hashToken(token)))).toBe(true);
  });

  it('readCookie acha o cookie certo e ignora nomes parecidos', () => {
    const header = 'outro=1; xdbwatch_session=falso; dbwatch_session=abc=; tema=claro';
    expect(readCookie(header, 'dbwatch_session')).toBe('abc=');
    expect(readCookie(header, 'nao_existe')).toBeUndefined();
    expect(readCookie(undefined, 'dbwatch_session')).toBeUndefined();
    expect(readCookie('dbwatch_session=', 'dbwatch_session')).toBeUndefined();
  });

  it('em produção o cookie usa o prefixo __Host-', () => {
    expect(sessionCookieName(true)).toBe('__Host-dbwatch_session');
    expect(sessionCookieName(false)).toBe('dbwatch_session');
  });

  it('loginSchema normaliza o e-mail e recusa campos extras', () => {
    expect(loginSchema.parse({ email: '  Ana@DBWatch.Test ', password: 'x' }).email).toBe('ana@dbwatch.test');
    expect(loginSchema.safeParse({ email: 'ana@dbwatch.test', password: 'x', admin: true }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'ana@dbwatch.test', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'ana@dbwatch.test', password: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('RateLimiter (janela fixa)', () => {
  it('libera até o limite, bloqueia o excesso e reabre na próxima janela', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect([limiter.allow('ip'), limiter.allow('ip'), limiter.allow('ip')]).toEqual([true, true, false]);
    expect(limiter.allow('outro-ip')).toBe(true);
    now = 1000;
    expect(limiter.allow('ip')).toBe(true);
  });
});
