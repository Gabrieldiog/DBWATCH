import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import { AutoRefresh } from '../../../components/auto-refresh';
import { EventFeed } from '../../../components/event-feed';
import { LineChart } from '../../../components/line-chart';
import { LockGraph } from '../../../components/lock-graph';
import { SimulationButton } from '../../../components/simulation-button';
import { pick, staleFor, time, total, type Lock, type MonitorEvent, type Overview, type RawPoint } from '../../../lib/monitor';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Monitor' };

// Mesmo valor padrão do MONITOR_SAMPLE_SECONDS da API
const EVERY = 5;

export default async function Monitor() {
  const me = await requirePermission('monitor:read');
  const [o, rows, locks, events] = await Promise.all([
    apiGet<Overview>('/monitor/overview'),
    apiGet<RawPoint[]>('/monitor/series?minutes=30'),
    apiGet<Lock[]>('/monitor/locks'),
    // 200 eventos cobrem o último minuto da tabela dos gráficos; o feed ao vivo usa os 12 mais novos
    apiGet<MonitorEvent[]>('/monitor/events?limit=200'),
  ]);
  const stale = staleFor(o.sampledAt, Date.now(), EVERY);
  const cache = pick(rows, 'cacheHitPct').findLast((p) => p.v !== null)?.v;
  const stats: [string, string | number][] = [
    ['Ativas', o.active],
    ['Ociosas', o.idle],
    ['Ociosas em transação', o.idleInTransaction],
    ['Esperando lock', o.waitingOnLock],
    ['Pares bloqueados', o.blockedPairs],
    ['Cache hit', cache === undefined ? 'sem dado' : `${cache}%`],
    // Contador nativo do pg_stat_database: sobe quando o PostgreSQL derruba uma vítima de deadlock
    ['Deadlocks (30 min)', total(pick(rows, 'deadlocks'))],
  ];

  return (
    <main className="console-page">
      <h1>Monitor</h1>
      <p>
        Amostras reais de <code>pg_stat_activity</code>, <code>pg_locks</code> e <code>pg_stat_database</code>,
        coletadas a cada {EVERY} s pelo papel <code>dbwatch_monitor</code>. A tela relê a última amostra sozinha.
      </p>
      <Explica>
        <p>Tudo aqui vem das views internas do PostgreSQL, lidas pelo papel <code>dbwatch_monitor</code> a cada 5 s. Nada é desenhado à mão.</p>
        <ul>
          <li><strong>Ativas:</strong> conexões executando um comando agora.</li>
          <li><strong>Ociosas:</strong> conexões abertas esperando trabalho (as da API, do coletor e das consultas). Várias é normal.</li>
          <li><strong>Ociosas em transação:</strong> abriram uma transação e pararam sem confirmar. Seguram locks e travam os outros; o incidente simulado mostra isso.</li>
          <li><strong>Esperando lock e pares bloqueados:</strong> quem está parado esperando outra sessão soltar uma linha, e quem bloqueia quem (o grafo).</li>
          <li><strong>Cache hit:</strong> quanto das leituras veio da memória, sem ir ao disco.</li>
          <li><strong>Deadlocks:</strong> quantas vezes o banco achou duas transações travando uma à outra e derrubou uma.</li>
          <li><strong>Commits e rollbacks a cada 5 s:</strong> transações confirmadas e desfeitas no banco da aplicação em cada intervalo. Os commits vêm do próprio coletor (um por amostra), de cada clique (a sessão guarda o último uso) e de cada ação. O PostgreSQL só conta, não diz quais; por isso cada ação registrada (consulta, login, pedido, aprovação) aparece nos eventos abaixo na hora, e os rollbacks da API também.</li>
        </ul>
      </Explica>
      <AutoRefresh seconds={EVERY} />
      {!o.sampledAt ? (
        <p className="notice" role="status">
          Nenhuma amostra ainda. A primeira chega em até {EVERY} s.
        </p>
      ) : stale ? (
        <p className="alert" role="alert">
          A coleta parou. Os números abaixo são da última amostra, das {time(o.sampledAt)}.
        </p>
      ) : (
        <p className="note">Última amostra às {time(o.sampledAt)}.</p>
      )}
      {me.permissions.includes('lab:run') && <SimulationButton />}
      <h2>Agora no PostgreSQL</h2>
      <p className="note">Fonte: PostgreSQL observado (pg_stat_activity, pg_locks e pg_stat_database).</p>
      <dl className="stats">
        {stats.map(([label, value]) => (
          <div key={label} className="panel">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h2>Bloqueios agora</h2>
      <p className="note">Fonte: PostgreSQL observado (pg_locks e pg_blocking_pids).</p>
      <LockGraph locks={locks} />
      <h2>Eventos ao vivo</h2>
      <p className="note">
        Cada evento diz a fonte: o PostgreSQL (alertas do coletor), a aplicação (cada ação registrada, rollbacks e break-glass)
        ou o LAB. Quem fez cada ação fica na Auditoria, para quem pode ler a trilha.
      </p>
      <EventFeed initial={events.slice(0, 12)} canAudit={me.permissions.includes('audit:read')} />
      <h2>Últimos 30 minutos no banco da aplicação</h2>
      <p className="note">
        Fonte: PostgreSQL observado (pg_stat_database). A própria coleta grava uma transação por amostra, por isso os
        commits nunca chegam a zero.
      </p>
      <div className="charts">
        <LineChart title="Commits a cada 5 s" unit="commits" points={pick(rows, 'commits')} events={events} />
        <LineChart title="Rollbacks a cada 5 s" unit="rollbacks" points={pick(rows, 'rollbacks')} events={events} />
      </div>
    </main>
  );
}
