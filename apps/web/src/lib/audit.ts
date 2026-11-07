import type { Tone } from './pam';

export type Entry = {
  chainPosition: number;
  occurredAt: string;
  actorEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: string;
  reason: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown> | null;
};
export type AuditFilter = { correlationId?: string; action?: string; outcome?: string; actorEmail?: string; from?: string; to?: string; cursor?: string };
type Raw = Record<string, string | string[] | undefined>;

export const OUTCOME: Record<string, [string, Tone]> = {
  SUCCESS: ['Sucesso', 'ok'],
  DENIED: ['Negado', 'bad'],
  FAILURE: ['Falha', 'wait'],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION = /^[a-z]+(\.[a-z_]+)+$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// O campo de data do navegador vem sem fuso; a demonstração é em Goiás (UTC-3, sem horário de verão)
export const toIso = (local?: string) => (local ? `${local}:00-03:00` : undefined);

// Mesmas regras da API: um filtro inválido vira aviso na tela em vez de um 400 que quebraria a página
export function auditQuery(raw: Raw): { filter: AuditFilter; qs: string; error: string | null } {
  const one = (key: string) => [raw[key]].flat()[0]?.trim() || undefined;
  const keys = ['correlationId', 'action', 'outcome', 'actorEmail', 'from', 'to', 'cursor'] as const;
  const filter: AuditFilter = Object.fromEntries(keys.map((k) => [k, one(k)]));
  let error: string | null = null;
  if (filter.correlationId && !UUID.test(filter.correlationId)) error = 'O código da execução precisa ser um UUID completo.';
  else if (filter.action && !ACTION.test(filter.action)) error = 'A ação segue o formato area.acao, como pam.query_execute.';
  else if (filter.outcome && !OUTCOME[filter.outcome]) error = 'Resultado desconhecido.';
  else if (filter.actorEmail && !/^[^\s@]+@[^\s@]+$/.test(filter.actorEmail)) error = 'Informe o e-mail completo da pessoa.';
  else if ([filter.from, filter.to].some((d) => d && !LOCAL.test(d))) error = 'Data inválida.';
  else if (filter.cursor && !/^\d+$/.test(filter.cursor)) error = 'Página inválida.';
  return { filter, qs: toQuery({ ...filter, from: toIso(filter.from), to: toIso(filter.to) }), error };
}

export function toQuery(filter: AuditFilter): string {
  return new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1]))).toString();
}
