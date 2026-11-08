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

// PK-25: a frase do evento em português, com quem fez (o gatilho do banco manda só o nome de exibição)
// [o que fez, o que tentou fazer]
const VERBO: Record<string, [string, string]> = {
  'auth.login': ['entrou no sistema', 'entrar no sistema'], 'auth.logout': ['saiu do sistema', 'sair do sistema'],
  'auth.session_revoke': ['encerrou uma sessão', 'encerrar uma sessão'],
  'pam.request_create': ['pediu acesso a', 'pedir acesso a'], 'pam.request_approve': ['aprovou o pedido de', 'aprovar o pedido de'],
  'pam.request_reject': ['rejeitou o pedido de', 'rejeitar o pedido de'], 'pam.request_cancel': ['cancelou o pedido de', 'cancelar o pedido de'],
  'pam.grant_revoke': ['revogou o acesso a', 'revogar o acesso a'], 'pam.grant_expired': ['encerrou o acesso vencido a', 'encerrar o acesso vencido a'],
  'pam.query_execute': ['consultou', 'consultar'], 'pam.console_execute': ['executou um comando no console em', 'executar um comando no console em'],
  'pam.break_glass': ['abriu um acesso de emergência a', 'abrir um acesso de emergência a'], 'pam.break_glass_review': ['revisou a emergência em', 'revisar a emergência em'],
  'audit.verify': ['verificou a cadeia de auditoria', 'verificar a cadeia de auditoria'], 'lab.run': ['rodou um experimento do laboratório', 'rodar um experimento'],
  'lab.simulation': ['iniciou a simulação', 'iniciar a simulação'], 'iam.user_create': ['criou uma pessoa', 'criar uma pessoa'],
  'iam.user_status': ['ativou ou desativou', 'ativar ou desativar'], 'iam.role_assign': ['deu um papel a', 'dar um papel a'],
  'iam.role_remove': ['tirou um papel de', 'tirar um papel de'], 'iam.sessions_revoke': ['encerrou as sessões de', 'encerrar as sessões de'],
  'iam.seed_demo': ['recriou os usuários de demonstração', 'recriar os usuários de demonstração'],
  'iam.acl_create': ['criou uma regra de login', 'criar uma regra de login'], 'iam.acl_delete': ['removeu uma regra de login', 'remover uma regra de login'],
  'auth.account_locked': ['teve a conta bloqueada por tentativas', 'entrar com a conta bloqueada'], 'authz.denied': ['abriu uma rota', 'abrir uma rota sem permissão'],
};
const MOTIVO: Record<string, string> = {
  grant_expired: 'o acesso tinha expirado', grant_revoked: 'o acesso tinha sido revogado', grant_not_started: 'o acesso ainda não tinha começado',
  sem_concessao: 'não tinha acesso a esse recurso', senha_incorreta: 'senha incorreta', conta_bloqueada: 'a conta está bloqueada',
  acl_negado: 'fora do horário ou da rede permitidos', cadeia_integra: 'nenhum registro foi alterado', cadeia_adulterada: 'a cadeia foi adulterada',
};
const motivo = (m: unknown) => {
  const raw = String(m ?? '');
  if (raw.startsWith('sqlstate:')) return `o banco recusou (SQLSTATE ${raw.slice(9, 14)})`;
  return MOTIVO[raw] ?? raw;
};

export function activitySentence(op: string, d: Record<string, unknown>): string {
  const quem = String(d.quem ?? 'O sistema');
  const [fez, tentou] = VERBO[op] ?? [`fez: ${(ACTION_LABEL[op] ?? op).toLowerCase()}`, `fazer: ${(ACTION_LABEL[op] ?? op).toLowerCase()}`];
  const alvo = d.alvo ? ` ${String(d.alvo)}` : '';
  if (d.resultado === 'SUCCESS') return `${quem} ${fez}${alvo}.`;
  const por = d.motivo ? `: ${motivo(d.motivo)}` : '';
  return `${quem} tentou ${tentou}${alvo}, mas ${d.resultado === 'DENIED' ? 'foi negado' : 'falhou'}${por}.`;
}

export function describeEvent(e: MonitorEvent): [string, string] {
  const d = e.detail;
  if (e.kind === 'LAB') return [String(d.titulo ?? 'LAB'), String(d.texto ?? '')];
  if (e.kind === 'ACTIVITY') {
    const title = ACTION_LABEL[e.operation ?? ''] ?? String(e.operation);
    // Eventos gravados antes do PK-25 não têm "quem": mostram a forma antiga em vez de inventar um autor
    if (!('quem' in d) && !('tipoAlvo' in d)) return [title, `${e.operation}: ${OUTCOME[String(d.resultado)] ?? d.resultado}${d.motivo ? ` (${String(d.motivo)})` : ''}`];
    return [title, activitySentence(e.operation ?? '', d)];
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

// "Detalhar" de cada evento: o que aconteceu e de onde veio, sem afirmar o que o DBWATCH não vê (PK-25)
export function explainEvent(e: MonitorEvent): string {
  const d = e.detail;
  if (e.kind === 'LAB')
    return String(d.detalhe ?? 'Passo da simulação, gravado pelo bot no momento em que aconteceu no PostgreSQL. Tudo fica na auditoria marcado como simulação.');
  if (e.kind === 'ACTIVITY')
    return `Ação registrada na trilha de auditoria (${e.operation}), protegida por cadeia de hash. Este evento nasceu na mesma transação do registro: se a ação fosse desfeita, ele sumiria junto.${d.motivo ? ` Motivo gravado: ${String(d.motivo)}.` : ''}`;
  switch (e.code) {
    case 'DEADLOCK':
      return 'Duas transações ficaram esperando uma pela outra (cada uma segurava o que a outra queria). O PostgreSQL percebe o ciclo depois do deadlock_timeout e derruba uma delas, a vítima, com o erro 40P01: o que ela tinha feito é desfeito e a outra segue. Este aviso vem do contador de deadlocks do pg_stat_database, lido pelo coletor a cada 5 s. Quais comandos estavam envolvidos fica só no log do servidor, que o DBWATCH não lê; se foi a simulação, o evento "Deadlock: o PostgreSQL escolheu uma vítima" logo antes conta qual transferência caiu.';
    case 'LOCK_WAIT':
      return `A sessão ${d.bloqueado} quer uma linha ou tabela que a sessão ${d.bloqueador} está segurando e ficou parada esperando. Visto pelo coletor em pg_locks e pg_blocking_pids(); o grafo de bloqueios mostra quem segura quem.`;
    case 'IDLE_IN_TRANSACTION':
      return 'A sessão abriu uma transação e parou sem COMMIT nem ROLLBACK. Enquanto isso, os locks dela continuam presos e podem travar outras sessões. Visto pelo coletor em pg_stat_activity.';
    case 'TX_ROLLBACK':
      return `A API abriu uma transação para ${e.operation}, uma regra recusou${e.sqlstate ? ` (SQLSTATE ${e.sqlstate})` : ''} e ela desfez tudo com ROLLBACK: nada pela metade ficou gravado.`;
    case 'BREAK_GLASS':
      return 'Alguém abriu um acesso de emergência sem esperar aprovação. É a única exceção à regra de que ninguém decide o próprio pedido, por isso vira alerta e outra pessoa revisa depois.';
    default:
      return 'Evento registrado pela aplicação.';
  }
}
