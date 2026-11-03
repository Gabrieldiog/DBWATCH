import type { Metadata } from 'next';
import { AutoRefresh } from '../../../components/auto-refresh';
import { LineChart } from '../../../components/line-chart';
import { pick, staleFor, time, type Overview, type RawPoint } from '../../../lib/monitor';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Monitor' };

// Mesmo valor padrão do MONITOR_SAMPLE_SECONDS da API
const EVERY = 5;

export default async function Monitor() {
  await requirePermission('monitor:read');
  const [o, rows] = await Promise.all([
    apiGet<Overview>('/monitor/overview'),
    apiGet<RawPoint[]>('/monitor/series?minutes=30'),
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
  ];

  return (
    <main className="console-page">
      <h1>Monitor</h1>
      <p>
        Amostras reais de <code>pg_stat_activity</code>, <code>pg_locks</code> e <code>pg_stat_database</code>,
        coletadas a cada {EVERY} s pelo papel <code>dbwatch_monitor</code>. A tela relê a última amostra sozinha.
      </p>
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
      <h2>Agora no PostgreSQL</h2>
      <dl className="stats">
        {stats.map(([label, value]) => (
          <div key={label} className="panel">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h2>Últimos 30 minutos no banco da aplicação</h2>
      <p className="note">A própria coleta grava uma transação por amostra, por isso os commits nunca chegam a zero.</p>
      <div className="charts">
        <LineChart title="Commits a cada 5 s" unit="commits" points={pick(rows, 'commits')} />
        <LineChart title="Rollbacks a cada 5 s" unit="rollbacks" points={pick(rows, 'rollbacks')} />
      </div>
    </main>
  );
}
