'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { LEVEL } from '../lib/pam';
import { send, type Sent } from '../lib/send';

export type Template = {
  code: string;
  title: string;
  accessLevel: string;
  maxRows: number;
  description: string;
  params: { name: string; label: string; type: 'text' | 'int'; options?: string[]; min?: number; max?: number }[];
  resource: { id: string; name: string };
};
type Result = { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; durationMs: number };

// O navegador só manda o código da consulta e os valores; o SQL fica no banco e os valores vão como $1, $2
export function QueryCard({ q }: { q: Template }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  // PK-30: o resultado abre numa janela por cima (dialog nativo: Esc fecha, o foco volta ao botão); os cartões não mudam de tamanho
  const dialog = useRef<HTMLDialogElement>(null);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = Object.fromEntries(q.params.map((p) => [p.name, p.type === 'int' ? Number(form.get(p.name)) : form.get(p.name)]));
    setBusy(true);
    const answer = await send(`/queries/${q.code}/execute`, { params });
    setSent(answer);
    setBusy(false);
    if (answer.ok) dialog.current?.showModal();
  }

  const result = sent?.ok ? (sent.data as Result) : null;
  return (
    <li className="panel">
      <h3>{q.title}</h3>
      <p>{q.description}</p>
      <p className="note">
        {LEVEL[q.accessLevel]} · até {q.maxRows} {q.maxRows === 1 ? 'linha' : 'linhas'}
      </p>
      <form className="row" onSubmit={run}>
        {q.params.map((p) => (
          <label key={p.name} className="field">
            {p.label}
            {p.options ? (
              <select name={p.name}>
                {p.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input name={p.name} type={p.type === 'int' ? 'number' : 'text'} min={p.min ?? 0} max={p.max} maxLength={100} required />
            )}
            {p.type === 'int' && p.max !== undefined && <small className="note">De {p.min ?? 0} a {p.max}</small>}
          </label>
        ))}
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Executando…' : 'Executar'}
        </button>
      </form>
      {sent && !sent.ok && (
        <p className="alert" role="alert">
          {sent.message}
          {/acesso a este recurso/.test(sent.message) && (
            <>
              {' '}
              <Link href={`/pedidos?recurso=${q.resource.id}`}>Pedir acesso a {q.resource.name}</Link>
            </>
          )}
        </p>
      )}
      {sent && !sent.ok && sent.requestId && (
        <p className="note" role="status">
          código da execução <code>{sent.requestId}</code>
        </p>
      )}
      <dialog ref={dialog} className="resultado" aria-label="Resultado da consulta">
        <div className="resultado-topo">
          <h3>{q.title}</h3>
          <button type="button" className="button button-quiet button-small" onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </div>
        {result && (
          <>
            <p className="note" role="status">
              {result.rowCount} linha(s) em {result.durationMs} ms{result.truncated ? ', cortado no limite' : ''} · código da execução <code>{sent?.requestId}</code>
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {result.columns.map((c) => (
                        <td key={c} data-label={c}>
                          {String(row[c] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </dialog>
    </li>
  );
}
