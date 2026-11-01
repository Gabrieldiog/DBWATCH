// Só caminhos internos: "?next=https://outro.site" ou "//outro.site" virariam redirecionamento aberto
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/painel';
  return value;
}

// A API já responde em português; o front só cobre o que ela não diz (rede fora, resposta sem texto)
export function loginErrorMessage(status: number, body: unknown): string {
  if (status === 0) return 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.';
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && status < 500) return message;
  return 'O servidor não conseguiu concluir a entrada. Tente de novo em instantes.';
}

const NOTICES: Record<string, string> = {
  // Expirou por tempo ou foi revogada (por outra aba, pelo admin): para quem usa, o efeito é o mesmo
  expirou: 'Sua sessão terminou. Entre de novo para continuar de onde parou.',
  saiu: 'Você saiu. A sessão foi encerrada no servidor.',
};

export function loginNotice(reason: string | null): string | null {
  // hasOwn: sem isso, ?motivo=toString devolveria uma função herdada do Object
  return reason && Object.hasOwn(NOTICES, reason) ? (NOTICES[reason] ?? null) : null;
}
