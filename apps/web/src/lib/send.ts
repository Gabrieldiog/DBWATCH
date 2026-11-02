import { loginUrl } from './console';
import { errorMessage } from './pam';

// requestId é o correlation_id da API: o mesmo código aparece na trilha de auditoria
export type Sent = ({ ok: true; data: unknown } | { ok: false; message: string }) & { requestId?: string };

// Toda escrita sai do navegador para /api; o próprio fetch manda o cabeçalho Origin que a API confere
export async function send(path: string, body?: unknown): Promise<Sent> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (res?.status === 401) {
    window.location.assign(loginUrl(window.location.pathname, true));
    return { ok: false, message: 'Sessão encerrada' };
  }
  if (!res) return { ok: false, message: errorMessage(0, null) };
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  const requestId = res.headers.get('x-request-id') ?? undefined;
  return res.ok ? { ok: true, data, requestId } : { ok: false, message: errorMessage(res.status, data), requestId };
}
