'use client';

import { useEffect, useState } from 'react';

type Reading =
  | { kind: 'pending' }
  | { kind: 'up' | 'down'; latencyMs?: number; at: Date; seq: number }
  | { kind: 'unreachable'; at: Date; seq: number };

const INTERVAL_MS = 5_000;
const LABEL = { pending: 'Medindo…', up: 'PostgreSQL no ar', down: 'PostgreSQL fora do ar', unreachable: 'API sem resposta' };
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function HealthPulse() {
  const [reading, setReading] = useState<Reading>({ kind: 'pending' });

  useEffect(() => {
    let seq = 0;
    let active = true;
    let inflight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function measure() {
      inflight = true;
      timer = undefined;
      seq += 1;
      try {
        // Sem tempo-limite, uma API travada deixaria a tela em "Medindo…" para sempre
        const res = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(4_000) });
        const body = (await res.json()) as { database?: { status?: string; latencyMs?: number } };
        const up = res.ok && body.database?.status === 'up';
        if (active) setReading({ kind: up ? 'up' : 'down', latencyMs: body.database?.latencyMs, at: new Date(), seq });
      } catch {
        if (active) setReading({ kind: 'unreachable', at: new Date(), seq });
      }
      inflight = false;
      if (!active) return;
      // Aba escondida não mede: ninguém está olhando e o banco não precisa de consultas à toa
      if (document.visibilityState === 'visible') timer = setTimeout(measure, INTERVAL_MS);
    }

    function onVisibility() {
      // Sem a checagem de inflight, voltar à aba no meio de uma leitura criaria um segundo ciclo
      if (document.visibilityState === 'visible' && !timer && !inflight) void measure();
      if (document.visibilityState === 'hidden' && timer) {
        clearTimeout(timer);
        timer = undefined;
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
  return (
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
  );
}
