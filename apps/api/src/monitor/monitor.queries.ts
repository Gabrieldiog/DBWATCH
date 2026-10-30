// SQL do coletor: só constantes, sem nenhuma entrada do usuário

export const SAMPLE_DATABASES = `
  INSERT INTO monitor.db_samples
  SELECT now(), datname, numbackends, xact_commit, xact_rollback, deadlocks, blks_hit, blks_read, temp_files, stats_reset
    FROM pg_stat_database WHERE datname IS NOT NULL AND datname NOT LIKE 'template%'`;

// Do texto da query fica só a primeira palavra em maiúsculas (SELECT, UPDATE...): literais nunca saem daqui
export const SAMPLE_ACTIVITY = `
  INSERT INTO monitor.activity_samples
  SELECT now(), pid, datname, usename, application_name, state, wait_event_type, wait_event,
         (extract(epoch FROM now() - xact_start) * 1000)::bigint, substring(upper(ltrim(query)) FROM '^([A-Z]{1,12})')
    FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()`;

export const SAMPLE_LOCKS = `
  INSERT INTO monitor.lock_samples
  SELECT DISTINCT ON (a.pid, b.pid) now(), a.pid, b.pid, a.datname, l.locktype, l.mode,
         CASE WHEN a.datname = current_database() THEN l.relation::regclass::text END,
         (extract(epoch FROM now() - coalesce(l.waitstart, a.state_change)) * 1000)::bigint,
         a.application_name, bb.application_name
    FROM pg_stat_activity a
   CROSS JOIN LATERAL unnest(pg_blocking_pids(a.pid)) AS b(pid)
    LEFT JOIN pg_locks l ON l.pid = a.pid AND NOT l.granted
    LEFT JOIN pg_stat_activity bb ON bb.pid = b.pid
   ORDER BY a.pid, b.pid`;

export const RETENTION = [
  ['db_samples', 'sampled_at'], ['activity_samples', 'sampled_at'], ['lock_samples', 'sampled_at'], ['app_events', 'occurred_at'],
].map(([table, column]) => `DELETE FROM monitor.${table} WHERE ${column} < now() - make_interval(days => $1)`);

// Alertas sobre a amostra que acabou de ser gravada (mesmo now()); o NOT EXISTS evita repetir o mesmo alerta a cada 5 s
export const ALERT_LOCK_WAIT = `
  INSERT INTO monitor.app_events (kind, code, severity, detail)
  SELECT 'ALERT', 'LOCK_WAIT', 'medium', jsonb_build_object('database', datname, 'bloqueado', blocked_pid,
         'bloqueador', blocking_pid, 'esperaMs', wait_ms, 'relacao', relation, 'app', blocked_app)
    FROM monitor.lock_samples l
   WHERE sampled_at = now() AND wait_ms >= $1
     AND NOT EXISTS (SELECT 1 FROM monitor.app_events e WHERE e.code = 'LOCK_WAIT' AND e.occurred_at > now() - interval '1 minute'
                        AND (e.detail ->> 'bloqueado')::int = l.blocked_pid AND (e.detail ->> 'bloqueador')::int = l.blocking_pid)`;

export const ALERT_IDLE_IN_TX = `
  INSERT INTO monitor.app_events (kind, code, severity, detail)
  SELECT 'ALERT', 'IDLE_IN_TRANSACTION', 'medium', jsonb_build_object('database', datname, 'pid', pid, 'idadeMs', xact_age_ms, 'app', application_name)
    FROM monitor.activity_samples a
   WHERE sampled_at = now() AND state LIKE 'idle in transaction%' AND xact_age_ms >= $1
     AND NOT EXISTS (SELECT 1 FROM monitor.app_events e WHERE e.code = 'IDLE_IN_TRANSACTION'
                        AND e.occurred_at > now() - interval '5 minutes' AND (e.detail ->> 'pid')::int = a.pid)`;

// Deadlock novo = o contador subiu desde a amostra anterior do mesmo banco (sem reinício no meio)
export const ALERT_DEADLOCK = `
  INSERT INTO monitor.app_events (kind, code, severity, detail)
  SELECT 'ALERT', 'DEADLOCK', 'high', jsonb_build_object('database', cur.datname, 'novos', cur.deadlocks - prev.deadlocks)
    FROM monitor.db_samples cur
    JOIN LATERAL (SELECT p.deadlocks, p.stats_reset FROM monitor.db_samples p
                   WHERE p.datname = cur.datname AND p.sampled_at < cur.sampled_at ORDER BY p.sampled_at DESC LIMIT 1) prev ON true
   WHERE cur.sampled_at = now() AND cur.deadlocks > prev.deadlocks AND cur.stats_reset IS NOT DISTINCT FROM prev.stats_reset`;

export const RECENT_EVENTS = `
  SELECT id, occurred_at AS "occurredAt", kind, code, severity, operation, sqlstate, correlation_id AS "correlationId", detail
    FROM monitor.app_events ORDER BY id DESC LIMIT $1`;

// Diferença entre amostras; contador que voltou (reinício ou pg_stat_reset) vira NULL, nunca taxa negativa
const delta = (col: string) =>
  `CASE WHEN stats_reset IS DISTINCT FROM lag(stats_reset) OVER w OR ${col} < lag(${col}) OVER w THEN NULL
        ELSE ${col} - lag(${col}) OVER w END`;

export const SERIES = `
  SELECT "sampledAt", commits, rollbacks, deadlocks,
         round(100.0 * hits / nullif(hits + reads, 0), 1) AS "cacheHitPct"
    FROM (SELECT sampled_at AS "sampledAt", ${delta('xact_commit')} AS commits, ${delta('xact_rollback')} AS rollbacks,
                 ${delta('deadlocks')} AS deadlocks, ${delta('blks_hit')} AS hits, ${delta('blks_read')} AS reads
            FROM monitor.db_samples
           WHERE datname = $1 AND sampled_at > now() - make_interval(mins => $2)
          WINDOW w AS (ORDER BY sampled_at)) s
   ORDER BY "sampledAt"`;
