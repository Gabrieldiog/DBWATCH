import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACTION_LABEL, describeEvent, explainEvent, fromStream, layout, linePath, niceMax, pick, sourceOf, staleFor, summary, total } from '../src/lib/monitor';

describe('monitor (unitário)', () => {
  it('converte o texto do pg em número e mantém o null do contador reiniciado', () => {
    const rows = [{ sampledAt: 't1', commits: '12', rollbacks: null, deadlocks: '1', cacheHitPct: '99.5' }];
    expect(pick(rows, 'commits')).toEqual([{ t: 't1', v: 12 }]);
    expect(pick(rows, 'rollbacks')).toEqual([{ t: 't1', v: null }]);
  });

  it('coleta parada só depois de três intervalos sem amostra', () => {
    const now = Date.parse('2026-11-11T13:00:20Z');
    expect(staleFor(null, now, 5)).toBeNull();
    expect(staleFor('2026-11-11T13:00:05Z', now, 5)).toBe(0);
    expect(staleFor('2026-11-11T13:00:00Z', now, 5)).toBe(20);
  });

  it('um null quebra a linha em vez de ligar os pontos vizinhos', () => {
    const points = [3, null, 6, 0].map((v, i) => ({ t: String(i), v }));
    expect(linePath(points, 300, 100, 6)).toBe('M0.0 50.0M200.0 0.0L300.0 100.0');
  });

  it('teto do eixo arredondado e nunca abaixo de 1', () => {
    expect([[0], [null], [3], [7], [12], [480]].map(niceMax)).toEqual([1, 1, 5, 10, 20, 500]);
  });

  it('resumo para leitor de tela', () => {
    const points = [4, 9, 2].map((v, i) => ({ t: String(i), v }));
    expect(summary(points, 'commits')).toBe('Último intervalo: 2 commits. Máximo no período: 9 commits.');
    expect(summary([], 'commits')).toBe('Sem amostras no período.');
  });

  it('grafo: quem segura o lock fica à esquerda e a seta para na borda de quem espera', () => {
    const lock = { blockedPid: 20, blockingPid: 10, locktype: 'advisory', mode: 'ExclusiveLock', relation: null, waitMs: '900', blockedApp: 'B', blockingApp: 'A' };
    const { nodes, edges } = layout([lock]);
    expect(nodes.map((n) => [n.pid, n.x, n.waiting])).toEqual([[10, -90, false], [20, 90, true]]);
    expect(edges).toEqual([{ key: '10-20', x1: -64, y1: 0, x2: 64, y2: 0 }]);
  });

  it('o evento do SSE (snake_case do NOTIFY) vira o mesmo formato da rota', () => {
    const e = fromStream({ id: 1, occurred_at: 't', correlation_id: 'c', code: 'TX_ROLLBACK', operation: 'iam.role_assign', sqlstate: '23514', detail: {} });
    expect([e.occurredAt, e.correlationId, e.fresh]).toEqual(['t', 'c', true]);
    expect(describeEvent(e)).toEqual(['Rollback na API', 'iam.role_assign voltou com SQLSTATE 23514']);
    const wait = describeEvent({ ...e, code: 'LOCK_WAIT', detail: { bloqueado: 20, bloqueador: 10, app: 'B', esperaMs: 5400 } });
    expect(wait[1]).toBe('pid 20 (B) espera o pid 10 há 5 s');
  });

  it('deadlocks somados no período e a fonte de cada evento', () => {
    expect(total([1, null, 2, 0].map((v, i) => ({ t: String(i), v })))).toBe(3);
    expect(sourceOf({ kind: 'TX_ROLLBACK', code: 'TX_ROLLBACK' })[0]).toBe('Aplicação');
    expect(sourceOf({ kind: 'ALERT', code: 'BREAK_GLASS' })[0]).toBe('Aplicação');
    expect(sourceOf({ kind: 'ALERT', code: 'DEADLOCK' })[0]).toBe('PostgreSQL');
    expect(sourceOf({ kind: 'LAB', code: 'SIM_STEP' })[0]).toBe('LAB');
    const lab = { id: 9, occurredAt: 't', kind: 'LAB', code: 'SIM_STEP', severity: 'high', operation: null, sqlstate: null, correlationId: null };
    expect(describeEvent({ ...lab, detail: { titulo: 'Deadlock', texto: 'Erro 40P01' } })).toEqual(['Deadlock', 'Erro 40P01']);
  });
});

describe('atividade da auditoria no monitor (unitário)', () => {
  const base = { id: 1, occurredAt: '2026-11-08T12:00:00Z', kind: 'ACTIVITY', code: 'AUDIT', severity: 'medium', sqlstate: null, correlationId: 'c' };
  it('traduz a ação, diz o resultado e o motivo, e a fonte é a aplicação', () => {
    expect(describeEvent({ ...base, operation: 'pam.query_execute', detail: { resultado: 'DENIED', motivo: 'sem_concessao' } })).toEqual([
      'Consulta executada',
      'pam.query_execute: negado (sem_concessao)',
    ]);
    expect(describeEvent({ ...base, operation: 'auth.login', detail: { resultado: 'SUCCESS' } })).toEqual(['Login', 'auth.login: deu certo']);
    expect(sourceOf({ kind: 'ACTIVITY', code: 'AUDIT' })[0]).toBe('Aplicação');
  });

  it('PK-25: com quem fez, a frase diz a pessoa, o recurso e o motivo em português', () => {
    const at = (operation: string, detail: Record<string, unknown>) => describeEvent({ ...base, operation, detail })[1];
    expect(at('pam.query_execute', { resultado: 'SUCCESS', quem: 'Diego Solicitante', alvo: 'Clientes' })).toBe('Diego Solicitante consultou Clientes.');
    expect(at('pam.query_execute', { resultado: 'DENIED', motivo: 'grant_expired', quem: 'Diego Solicitante', alvo: 'Clientes' })).toBe(
      'Diego Solicitante tentou consultar Clientes, mas foi negado: o acesso tinha expirado.');
    expect(at('pam.break_glass', { resultado: 'SUCCESS', quem: 'Ana Admin', alvo: 'Catálogo de produtos' })).toBe('Ana Admin abriu um acesso de emergência a Catálogo de produtos.');
    expect(at('iam.user_create', { resultado: 'FAILURE', motivo: 'sqlstate:23505 users_email_key', quem: 'Ana Admin', tipoAlvo: 'user' })).toBe(
      'Ana Admin tentou criar uma pessoa, mas falhou: o banco recusou (SQLSTATE 23505).');
    expect(at('pam.grant_expired', { resultado: 'SUCCESS', alvo: 'Clientes', tipoAlvo: 'access_grant' })).toBe('O sistema encerrou o acesso vencido a Clientes.');
  });

  it('PK-25: detalhar explica o evento; deadlock do contador admite o que o DBWATCH não vê', () => {
    expect(explainEvent({ ...base, operation: null, kind: 'ALERT', code: 'DEADLOCK', detail: { novos: 1, database: 'dbwatch' } })).toMatch(/40P01.*log do servidor, que o DBWATCH não lê/);
    expect(explainEvent({ ...base, operation: null, kind: 'LAB', code: 'SIM_STEP', detail: { titulo: 'x', texto: 'y', detalhe: 'A Ana → Bruno caiu' } })).toBe('A Ana → Bruno caiu');
    expect(explainEvent({ ...base, operation: 'pam.query_execute', detail: { resultado: 'DENIED', motivo: 'sem_concessao' } })).toMatch(/mesma transação.*sem_concessao/);
  });

  // Lê o código da API: uma ação auditada nova sem tradução quebra este teste
  it('toda ação que a API audita tem tradução', () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
    const src = files(join(__dirname, '../../api/src')).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(f, 'utf8')).join('\n');
    const actions = new Set([...src.matchAll(/(?:action: |decide\()'([a-z]+\.[a-z_]+)'/g)].map((m) => m[1]!));
    expect(actions.size).toBeGreaterThan(20);
    expect([...actions].filter((a) => !ACTION_LABEL[a])).toEqual([]);
  });
});
