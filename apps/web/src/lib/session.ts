import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { loginUrl, type Me } from './console';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
const SESSION_COOKIES = ['__Host-dbwatch_session', 'dbwatch_session'];

// Leitura feita no servidor do Next com o cookie de quem pediu a tela; o navegador nunca vê esse fetch
export async function apiGet<T>(path: string): Promise<T> {
  const jar = await cookies();
  const session = SESSION_COOKIES.map((name) => jar.get(name)).find(Boolean);
  const here = (await headers()).get('x-dbwatch-path') ?? '/painel';
  if (!session) redirect(loginUrl(here, false));
  const res = await fetch(`${apiUrl}/api${path}`, {
    headers: { cookie: `${session.name}=${session.value}` },
    cache: 'no-store',
  });
  // Tinha cookie e a API recusou: a sessão expirou ou foi revogada no banco
  if (res.status === 401) redirect(loginUrl(here, true));
  if (!res.ok) throw new Error(`API respondeu ${res.status} em ${path}`);
  return (await res.json()) as T;
}

// Layout e página chamam no mesmo request; o cache do React faz uma ida só à API
export const requireMe = cache(() => apiGet<Me>('/auth/me'));

// Tela fora do papel responde 404, como a API faz com recurso alheio: não confirma que a tela existe
export async function requirePermission(...anyOf: string[]): Promise<Me> {
  const me = await requireMe();
  if (!anyOf.some((p) => me.permissions.includes(p))) notFound();
  return me;
}
