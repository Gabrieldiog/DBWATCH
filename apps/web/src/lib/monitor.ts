// Formatos do monitor; tudo puro para ser testado sem navegador
export type Overview = {
  sampledAt: string | null;
  active: number;
  idle: number;
  idleInTransaction: number;
  waitingOnLock: number;
  blockedPairs: number;
};
// O pg devolve bigint e numeric como texto; null = contador zerou entre amostras (reinício), nunca taxa negativa
export type RawPoint = { sampledAt: string; commits: string | null; rollbacks: string | null; deadlocks: string | null; cacheHitPct: string | null };
export type Point = { t: string; v: number | null };

export const pick = (rows: RawPoint[], key: 'commits' | 'rollbacks' | 'deadlocks' | 'cacheHitPct'): Point[] =>
  rows.map((r) => ({ t: r.sampledAt, v: r[key] === null ? null : Number(r[key]) }));

// Coleta parada = três intervalos sem amostra nova; o monitor diz isso em vez de mostrar número velho
export function staleFor(sampledAt: string | null, now: number, everySeconds: number): number | null {
  if (!sampledAt) return null;
  const age = Math.round((now - Date.parse(sampledAt)) / 1000);
  return age > everySeconds * 3 ? age : 0;
}

// Linha do gráfico em coordenadas do SVG; um null quebra a linha em vez de inventar o ponto
export function linePath(points: Point[], width: number, height: number, max: number): string {
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  let d = '';
  let pen = 'M';
  points.forEach((p, i) => {
    if (p.v === null) return void (pen = 'M');
    d += `${pen}${(i * step).toFixed(1)} ${(height - (p.v / max) * height).toFixed(1)}`;
    pen = 'L';
  });
  return d;
}

// Teto do eixo arredondado para cima (1, 2 ou 5 vezes uma potência de 10), nunca abaixo de 1
export function niceMax(values: (number | null)[]): number {
  const top = Math.max(1, ...values.filter((v): v is number => v !== null));
  const pow = 10 ** Math.floor(Math.log10(top));
  return [1, 2, 5, 10].map((m) => m * pow).find((m) => m >= top)!;
}

export function summary(points: Point[], unit: string): string {
  const values = points.map((p) => p.v).filter((v): v is number => v !== null);
  if (!values.length) return 'Sem amostras no período.';
  return `Último intervalo: ${values.at(-1)} ${unit}. Máximo no período: ${Math.max(...values)} ${unit}.`;
}

const TIME = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium', timeZone: 'America/Sao_Paulo' });
export const time = (iso: string) => TIME.format(new Date(iso));

export type Lock = { blockedPid: number; blockingPid: number; locktype: string; mode: string; relation: string | null; waitMs: string; blockedApp: string | null; blockingApp: string | null };
export type Node = { pid: number; app: string; waiting: boolean; x: number; y: number };
export type Edge = { key: string; x1: number; y1: number; x2: number; y2: number };

// Nós num círculo (serve para cadeia e para ciclo); quem bloqueia vem primeiro, então com dois a seta vai da esquerda para a direita
export function layout(locks: Lock[], radius = 90, gap = 26): { nodes: Node[]; edges: Edge[] } {
  const apps = new Map<number, string>();
  for (const l of locks) apps.set(l.blockingPid, l.blockingApp ?? '').set(l.blockedPid, l.blockedApp ?? '');
  const pids = [...apps.keys()].sort((a, b) => Number(locks.some((l) => l.blockingPid === b)) - Number(locks.some((l) => l.blockingPid === a)));
  const nodes = pids.map((pid, i) => {
    const angle = Math.PI + (2 * Math.PI * i) / pids.length;
    const waiting = locks.some((l) => l.blockedPid === pid);
    return { pid, app: apps.get(pid)!, waiting, x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) };
  });
  const at = (pid: number) => nodes.find((n) => n.pid === pid)!;
  // A seta "A → B" diz que A bloqueia B; as pontas param na borda dos círculos
  const edges = locks.map((l) => {
    const [a, b] = [at(l.blockingPid), at(l.blockedPid)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [dx, dy] = [((b.x - a.x) / len) * gap, ((b.y - a.y) / len) * gap];
    return { key: `${a.pid}-${b.pid}`, x1: Math.round(a.x + dx), y1: Math.round(a.y + dy), x2: Math.round(b.x - dx), y2: Math.round(b.y - dy) };
  });
  return { nodes, edges };
}

// A rota REST devolve camelCase; o SSE repassa a linha do NOTIFY como o banco gerou (snake_case)
export type MonitorEvent = { id: number; occurredAt: string; kind: string; code: string; severity: string; operation: string | null; sqlstate: string | null; correlationId: string | null; detail: Record<string, unknown>; fresh?: boolean };
type Raw = Partial<MonitorEvent> & { occurred_at?: string; correlation_id?: string | null };
export const fromStream = (r: Raw): MonitorEvent =>
  ({ ...r, occurredAt: r.occurredAt ?? r.occurred_at, correlationId: r.correlationId ?? r.correlation_id ?? null, fresh: true }) as MonitorEvent;

const secs = (ms: unknown) => `${Math.round(Number(ms) / 1000)} s`;

// O que cada ação da auditoria quer dizer, para o evento de atividade do Monitor
export const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Login', 'auth.logout': 'Saída do sistema', 'auth.account_locked': 'Conta bloqueada por tentativas',
  'auth.session_revoke': 'Sessão encerrada', 'authz.denied': 'Acesso a uma rota negado',
  'iam.user_create': 'Pessoa criada', 'iam.user_status': 'Pessoa ativada ou desativada', 'iam.role_assign': 'Papel atribuído',
  'iam.role_remove': 'Papel removido', 'iam.sessions_revoke': 'Sessões de uma pessoa encerradas', 'iam.seed_demo': 'Usuários de demonstração recriados',
  'iam.acl_create': 'Regra de login criada', 'iam.acl_delete': 'Regra de login removida',
  'pam.request_create': 'Pedido de acesso', 'pam.request_approve': 'Decisão de aprovação', 'pam.request_reject': 'Pedido rejeitado',
  'pam.request_cancel': 'Pedido cancelado', 'pam.grant_revoke': 'Acesso revogado', 'pam.grant_expired': 'Acesso venceu sozinho',
  'pam.query_execute': 'Consulta executada', 'pam.console_execute': 'Comando no console SQL', 'pam.break_glass': 'Acesso de emergência', 'pam.break_glass_review': 'Emergência revisada',
  'audit.verify': 'Cadeia de auditoria verificada', 'lab.run': 'Experimento do laboratório', 'lab.simulation': 'Simulação iniciada',
};
const OUTCOME: Record<string, string> = { SUCCESS: 'deu certo', DENIED: 'negado', FAILURE: 'falhou' };
export function describeEvent(e: MonitorEvent): [string, string] {
  const d = e.detail;
  if (e.kind === 'LAB') return [String(d.titulo ?? 'LAB'), String(d.texto ?? '')];
  if (e.kind === 'ACTIVITY') {
    const why = d.motivo ? ` (${String(d.motivo)})` : '';
    return [ACTION_LABEL[e.operation ?? ''] ?? String(e.operation), `${e.operation}: ${OUTCOME[String(d.resultado)] ?? d.resultado}${why}`];
  }
  switch (e.code) {
    case 'TX_ROLLBACK':
      return ['Rollback na API', `${e.operation} ${e.sqlstate ? `voltou com SQLSTATE ${e.sqlstate}` : 'voltou por uma regra da API'}`];
    case 'LOCK_WAIT':
      return ['Espera longa por lock', `pid ${d.bloqueado} (${d.app}) espera o pid ${d.bloqueador} há ${secs(d.esperaMs)}`];
    case 'IDLE_IN_TRANSACTION':
      return ['Transação aberta e parada', `pid ${d.pid} (${d.app}) está assim há ${secs(d.idadeMs)}`];
    case 'DEADLOCK':
      return ['Deadlock detectado', `${d.novos} vítima(s) derrubada(s) pelo PostgreSQL no banco ${d.database}`];
    case 'BREAK_GLASS':
      return ['Acesso de emergência', `Break-glass de ${d.minutos} min aberto`];
    default:
      return [e.code, e.operation ?? ''];
  }
}

export const SEVERITY: Record<string, [string, 'muted' | 'wait' | 'bad']> = { info: ['Info', 'muted'], medium: ['Média', 'wait'], high: ['Alta', 'bad'] };

// Soma do período; null (contador reiniciado) não entra na conta
export const total = (points: Point[]) => points.reduce((sum, p) => sum + (p.v ?? 0), 0);

// De onde veio cada evento: o PRD exige que nenhum dado apareça sem fonte
export function sourceOf(e: Pick<MonitorEvent, 'kind' | 'code'>): ['PostgreSQL' | 'Aplicação' | 'LAB', 'db' | 'app' | 'lab'] {
  if (e.kind === 'LAB') return ['LAB', 'lab'];
  if (e.kind === 'TX_ROLLBACK' || e.kind === 'ACTIVITY' || e.code === 'BREAK_GLASS') return ['Aplicação', 'app'];
  return ['PostgreSQL', 'db'];
}
