'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { when } from '../lib/pam';
import { send, type Sent } from '../lib/send';

export type ConsoleResource = { id: string; name: string; access?: string };
type Result = { command: string; rowCount: number; columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; durationMs: number };

// Exemplos prontos para a apresentação: os que funcionam e os que o banco recusa (outra tabela, DDL)
const EXEMPLOS: Record<string, [string, string][]> = {
  Clientes: [
    ['Mudar a cidade de um cliente', "UPDATE loja.clientes SET cidade = 'Anápolis' WHERE id = 7 RETURNING id, nome, cidade"],
    ['Ver o cliente', 'SELECT id, nome, cidade FROM loja.clientes WHERE id = 7'],
    ['Apagar pedidos (outra tabela)', 'DELETE FROM loja.pedidos WHERE id = 1'],
    ['Apagar a tabela', 'DROP TABLE loja.clientes'],
  ],
  'Catálogo de produtos': [
    ['Reajustar Bebidas em 10%', "UPDATE loja.produtos SET preco = round(preco * 1.1, 2) WHERE categoria = 'Bebidas' RETURNING id, nome, preco"],
    ['Mexer nos clientes (outra tabela)', "UPDATE loja.clientes SET nome = 'x' WHERE id = 1"],
  ],
  Financeiro: [
    ['Lançar um pedido', 'INSERT INTO loja.pedidos (id, cliente_id, valor, criado_em) VALUES (9001, 7, 99.90, now()) ON CONFLICT (id) DO NOTHING RETURNING *'],
    ['Esvaziar a tabela', 'TRUNCATE loja.pedidos'],
  ],
};

// O navegador só manda o recurso e o texto; quem decide o que o comando pode fazer é o papel do banco daquele recurso
export function ConsoleForm({ resources }: { resources: ConsoleResource[] }) {
  const [resourceId, setResourceId] = useState(resources.find((r) => r.access)?.id ?? resources[0]?.id ?? '');
  const [sql, setSql] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const resource = resources.find((r) => r.id === resourceId);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSent(await send('/console/execute', { resourceId, sql }));
    setBusy(false);
  }

  const result = sent?.ok ? (sent.data as Result) : null;
  return (
    <form className="panel form console-sql" onSubmit={run}>
      <label className="field">
        Recurso
        <select value={resourceId} onChange={(e) => {
          setResourceId(e.target.value);
          setSent(null);
        }}>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {resource?.access ? (
        <p className="access access-ok">Você tem acesso de escrita a {resource.name} até {when(resource.access)}.</p>
      ) : (
        <p className="access">
          Sem acesso de escrita a {resource?.name} agora.{' '}
          <Link href={`/pedidos?recurso=${resourceId}&nivel=WRITE`}>Pedir escrita em {resource?.name}</Link>
        </p>
      )}
      <div className="row" aria-label="Exemplos">
        {(EXEMPLOS[resource?.name ?? ''] ?? []).map(([label, text]) => (
          <button key={label} type="button" className="button button-quiet button-small" onClick={() => setSql(text)}>
            {label}
          </button>
        ))}
      </div>
      <label className="field">
        Comando SQL (um por vez)
        <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={4} maxLength={2000} required spellCheck={false} />
      </label>
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Executando…' : 'Executar no banco'}
      </button>
      {sent && !sent.ok && (
        <p className="alert" role="alert">
          {sent.message}
        </p>
      )}
      {result && (
        <p className="notice" role="status">
          {result.command}: {result.rowCount} linha(s) em {result.durationMs} ms{result.truncated ? ', mostrando 100' : ''} · código da execução{' '}
          <code>{sent?.requestId}</code>
        </p>
      )}
      {result && result.columns.length > 0 && (
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
      )}
    </form>
  );
}
