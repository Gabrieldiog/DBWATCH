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

export const RETENTION = ['db_samples', 'activity_samples', 'lock_samples'].map(
  (table) => `DELETE FROM monitor.${table} WHERE sampled_at < now() - make_interval(days => $1)`,
);

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
