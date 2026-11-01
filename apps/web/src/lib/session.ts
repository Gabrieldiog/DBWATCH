import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { loginUrl, type Me } from './console';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
const SESSION_COOKIES = ['__Host-dbwatch_session', 'dbwatch_session'];

// Layout e página chamam no mesmo request; o cache do React faz uma ida só à API
export const requireMe = cache(async (): Promise<Me> => {
  const jar = await cookies();
  const session = SESSION_COOKIES.map((name) => jar.get(name)).find(Boolean);
  const path = (await headers()).get('x-dbwatch-path') ?? '/painel';
  if (!session) redirect(loginUrl(path, false));
  const res = await fetch(`${apiUrl}/api/auth/me`, {
    headers: { cookie: `${session.name}=${session.value}` },
    cache: 'no-store',
  });
  // Tinha cookie e a API recusou: a sessão expirou ou foi revogada no banco
  if (res.status === 401) redirect(loginUrl(path, true));
  if (!res.ok) throw new Error(`API respondeu ${res.status} em /auth/me`);
  return (await res.json()) as Me;
});
