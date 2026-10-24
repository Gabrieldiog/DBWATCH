'use client';

import { useEffect, useState } from 'react';
import { barHeight, type Mark, MAX_MARKS, pushMark, summarize } from '../lib/ronda';

type Reading = { kind: 'pending' } | { kind: 'up' | 'down' | 'unreachable'; latencyMs?: number; at: Date; seq: number };

const INTERVAL_MS = 5_000;
const LABEL = { pending: 'Medindo…', up: 'PostgreSQL no ar', down: 'PostgreSQL fora do ar', unreachable: 'API sem resposta' };
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function Ronda() {
  const [reading, setReading] = useState<Reading>({ kind: 'pending' });
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    let seq = 0;
    let active = true;
    let inflight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function record(next: Exclude<Reading, { kind: 'pending' }>) {
      if (!active) return;
      setReading(next);
      setMarks((prev) => pushMark(prev, { seq: next.seq, kind: next.kind, latencyMs: next.latencyMs }));
    }

    async function measure() {
      inflight = true;
      timer = undefined;
      seq += 1;
      try {
        // Sem tempo-limite, uma API travada deixaria a tela em "Medindo…" para sempre
        const res = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(4_000) });
        const body = (await res.json()) as { database?: { status?: string; latencyMs?: number } };
        const up = res.ok && body.database?.status === 'up';
        record({ kind: up ? 'up' : 'down', latencyMs: body.database?.latencyMs, at: new Date(), seq });
      } catch {
        record({ kind: 'unreachable', at: new Date(), seq });
      }
      inflight = false;
      if (!active) return;
      // Aba escondida não mede: ninguém está olhando e o banco não precisa de consultas à toa
      if (document.visibilityState === 'visible') timer = setTimeout(measure, INTERVAL_MS);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden' && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      // Sem a checagem de inflight, voltar à aba no meio de uma leitura criaria um segundo ciclo
      if (document.visibilityState === 'visible' && !timer && !inflight) {
        seq += 1;
        setMarks((prev) => pushMark(prev, { seq, kind: 'gap' }));
        void measure();
      }
    }

    void measure();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const state = reading.kind;
  const totals = summarize(marks);
  const readings = totals.up + totals.failed;

  return (
    <section className="ronda" aria-labelledby="ronda-titulo">
      <div className="ronda-head">
        <h2 id="ronda-titulo">Ronda</h2>
        <p>
          Leitura nº <span className="mono">{readings}</span> desta visita, a cada 5 s. Recarregar começa outra ronda.
        </p>
      </div>
      <div className="pulse" data-state={state}>
        <span className="pulse-dot" aria-hidden>
          {/* A chave muda a cada leitura real: o anel só se move quando o banco respondeu de fato */}
          {state === 'up' && <span key={reading.seq} className="pulse-ring" />}
        </span>
        <div>
          <p role="status" className="pulse-label">
            {LABEL[state]}
          </p>
          {reading.kind !== 'pending' && (
            <p className="pulse-meta">
              {reading.kind === 'up' && reading.latencyMs !== undefined && (
                <>
                  <span className="mono">{reading.latencyMs} ms</span> de resposta,{' '}
                </>
              )}
              leitura das <span className="mono">{time.format(reading.at)}</span>
            </p>
          )}
        </div>
      </div>
      <p className="sr-only">
        Últimas {readings} leituras: {totals.up} com o banco no ar e {totals.failed} com falha.
      </p>
      <ol className="strip" aria-hidden>
        {Array.from({ length: MAX_MARKS - marks.length }, (_, i) => (
          <li key={`vazio-${i}`} data-kind="empty" />
        ))}
        {marks.map((m) => (
          <li key={m.seq} data-kind={m.kind} style={{ height: barHeight(m) }} />
        ))}
      </ol>
      <div className="strip-axis" aria-hidden>
        <span>há 5 min</span>
        <span>agora</span>
      </div>
      <p className="strip-legend">
        Cada barra é uma leitura real. Altura: tempo de resposta (escala logarítmica). Vermelho: falha. Tracejado
        grosso: período com a aba escondida.
      </p>
    </section>
  );
}
