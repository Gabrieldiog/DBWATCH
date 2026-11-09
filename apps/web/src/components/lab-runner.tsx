'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CONCEPT, NOME, OUTCOME, outcomeOf, rowsText, slow, type Run, type Scenario } from '../lib/lab';
import { send } from '../lib/send';
import { Badge } from './badge';

// Os passos chegam todos juntos quando o experimento termina; a linha do tempo mostra os tempos medidos, sem encenar
export function LabRunner({ scenario }: { scenario: Scenario }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const sent = await send(`/lab/${scenario.name}/run`);
    setBusy(false);
    if (!sent.ok) return setError(sent.message);
    setRun(sent.data as Run);
    router.refresh();
  }

  return (
    <li className="panel">
      <h2>
        <span className="badge badge-wait">LAB</span> {NOME[scenario.name] ?? scenario.name}
      </h2>
      <p>{scenario.title}</p>
      <button type="button" className="button" onClick={start} disabled={busy}>
        {busy ? 'Rodando no banco…' : 'Rodar experimento'}
      </button>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {run && (
        <>
          <p role="status">
            <Badge entry={OUTCOME[run.outcome]} fallback={run.outcome} /> Execução #{run.id}: {run.steps.length} passos em{' '}
            {run.steps.at(-1)!.at + (run.steps.at(-1)!.ms ?? 0)} ms.
          </p>
          <ol className="steps" aria-label="Linha do tempo das sessões A e B">
            {run.steps.map((s, i) => (
              <li key={i} className={`step step-${s.session} ${slow(s) ? 'step-slow' : ''} ${s.result === 'erro' ? 'step-error' : ''}`}>
                <span className="note">
                  +{s.at} ms · sessão {s.session}
                </span>
                {s.note ? <em>{s.note}</em> : <code>{s.sql}</code>}
                {s.result && <span>{outcomeOf(s)}</span>}
                {s.rows?.length ? <span>Leu: {rowsText(s.rows)}</span> : null}
              </li>
            ))}
          </ol>
          {CONCEPT[run.scenario] && (
            <p className="concept">
              <strong>O que isso mostra:</strong> {CONCEPT[run.scenario]}
            </p>
          )}
        </>
      )}
    </li>
  );
}
