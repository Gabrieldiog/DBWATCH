// Formatos e rótulos das telas de PAM; tudo puro para ser testado sem navegador
export type Tone = 'ok' | 'wait' | 'bad' | 'muted';
export type Resource = { id: string; name: string; sensitivity: string; maxGrantMinutes: number };
export type AccessRequest = {
  id: string;
  accessLevel: string;
  requestedMinutes: number;
  justification: string;
  status: string;
  createdAt: string;
  decisionNote: string | null;
  firstApprovedAt: string | null;
  resource: { id: string; name: string; sensitivity: string };
  firstApprovedById?: string | null;
  requester?: { displayName: string; email: string };
};

export const STATUS: Record<string, [string, Tone]> = {
  PENDING: ['Pendente', 'wait'],
  APPROVED: ['Aprovado', 'ok'],
  REJECTED: ['Rejeitado', 'bad'],
  CANCELLED: ['Cancelado', 'muted'],
};

export const SENSITIVITY: Record<string, [string, Tone]> = {
  LOW: ['Baixa', 'muted'],
  MEDIUM: ['Média', 'wait'],
  HIGH: ['Alta', 'bad'],
};

export const LEVEL: Record<string, string> = { READ: 'Leitura', WRITE: 'Escrita' };

export function minutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Fuso fixo: o servidor da VPS pode estar em UTC, a apresentação é em Goiás
const DATE = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
export const when = (iso: string) => DATE.format(new Date(iso));

// Recurso HIGH precisa de duas pessoas: mostra em que etapa o pedido está
export function approvals(
  req: Pick<AccessRequest, 'status' | 'firstApprovedAt' | 'resource'>,
): string | null {
  if (req.resource.sensitivity !== 'HIGH' || req.status !== 'PENDING') return null;
  return req.firstApprovedAt ? '1 de 2 aprovações' : '0 de 2 aprovações';
}

type ApiError = { message?: string | string[] } | null;

export function errorMessage(status: number, body: ApiError): string {
  const msg = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;
  if (status === 0) return 'Sem conexão com o servidor. Tente de novo.';
  if (status >= 500) return 'O servidor falhou ao registrar. Nada foi alterado; tente de novo.';
  return msg ?? 'Não foi possível concluir a ação.';
}
