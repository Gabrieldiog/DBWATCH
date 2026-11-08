export type Me = { id: string; email: string; displayName: string; roles: string[]; permissions: string[] };
export type NavItem = { href: string; label: string; icon: string; group: '' | 'Acesso' | 'Governança'; anyOf: string[] };

// anyOf vazio = qualquer pessoa logada; o menu só esconde, quem nega de verdade é a API
export const NAV: NavItem[] = [
  { href: '/painel', label: 'Visão geral', group: '', anyOf: [], icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { href: '/monitor', label: 'Monitor', group: '', anyOf: ['monitor:read'], icon: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12l6-6' },
  { href: '/laboratorio', label: 'Laboratório', group: '', anyOf: ['lab:run'], icon: 'M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M8 3h8' },
  { href: '/sessoes', label: 'Minhas sessões', group: '', anyOf: [], icon: 'M3 5h18v11H3zM8 20h8M12 16v4' },
  { href: '/pedidos', label: 'Pedir acesso', group: 'Acesso', anyOf: ['request:create'], icon: 'M12 5v14M5 12h14' },
  { href: '/aprovacoes', label: 'Aprovações', group: 'Acesso', anyOf: ['request:review'], icon: 'M5 12l5 5 9-10' },
  { href: '/acessos', label: 'Meus acessos', group: 'Acesso', anyOf: ['grant:read:own', 'grant:revoke'], icon: 'M4 15a4 4 0 1 0 8 0a4 4 0 1 0-8 0M11 12l9-9M17 6l3 3' },
  { href: '/consultas', label: 'Consultas', group: 'Acesso', anyOf: ['query:execute'], icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/console', label: 'Console SQL', group: 'Acesso', anyOf: ['query:execute'], icon: 'M4 17l6-6-6-6M12 19h8' },
  { href: '/auditoria', label: 'Auditoria', group: 'Governança', anyOf: ['audit:read'], icon: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z' },
  { href: '/usuarios', label: 'Usuários', group: 'Governança', anyOf: ['user:manage', 'role:assign'], icon: 'M5 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M2 21c0-4 3-6 7-6s7 2 7 6M17 11l2 2 4-4' },
];

export function navFor(permissions: readonly string[]) {
  const allowed = NAV.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.includes(p)));
  return (['', 'Acesso', 'Governança'] as const)
    .map((group) => ({ group, items: allowed.filter((item) => item.group === group) }))
    .filter((g) => g.items.length > 0);
}

// Tela do console que a pessoa não pode ver. O layout chama antes do esqueleto de carregamento começar a ser
// enviado; depois disso o Next já mandou status 200 e o notFound() da página não vira mais um 404 de verdade
export function forbiddenPath(path: string, permissions: readonly string[]): boolean {
  const pathname = path.split('?')[0]!;
  const item = NAV.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return !!item && item.anyOf.length > 0 && !item.anyOf.some((p) => permissions.includes(p));
}

export const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administração', APPROVER: 'Aprovação', REQUESTER: 'Solicitante', AUDITOR: 'Auditoria' };

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  return ((parts[0]?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?';
}

export function loginUrl(path: string, expired: boolean): string {
  const query = new URLSearchParams({ next: path });
  if (expired) query.set('motivo', 'expirou');
  return `/entrar?${query}`;
}

// Resumo legível do user-agent gravado na sessão; o texto completo continua no title para quem quiser conferir
export function device(ua: string | null): string {
  if (!ua) return 'Navegador desconhecido';
  const browser = [['Edge', /Edg\//], ['Firefox', /Firefox\//], ['Chrome', /Chrome\//], ['Safari', /Safari\//]].find(([, re]) => (re as RegExp).test(ua))?.[0];
  const os = [['Android', /Android/], ['iOS', /iPhone|iPad/], ['Windows', /Windows/], ['macOS', /Mac OS X/], ['Linux', /Linux/]].find(([, re]) => (re as RegExp).test(ua))?.[0];
  if (!browser && !os) return ua.slice(0, 60);
  return `${browser ?? 'Navegador'}${os ? ` no ${os}` : ''}`;
}

// Dias na numeração ISO do PostgreSQL (extract(isodow)): 1 = segunda, 7 = domingo
export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export type AclRule = { id: string; priority: number; action: string; ipRange: string | null; weekdays: number[] | null; startTime: string | null; endTime: string | null; description: string };

// Quando a regra vale, em uma frase; campo nulo no banco quer dizer "qualquer"
export function aclWhen(r: Pick<AclRule, 'ipRange' | 'weekdays' | 'startTime' | 'endTime'>): string {
  const ip = r.ipRange ? `IP em ${r.ipRange}` : 'qualquer IP';
  const days = r.weekdays?.length ? r.weekdays.map((d) => WEEKDAYS[d - 1]).join(', ') : 'todos os dias';
  const hours = r.startTime ? `das ${r.startTime} às ${r.endTime}` : 'o dia todo';
  return `${ip}, ${days}, ${hours}`;
}
