'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { EXEMPLOS, explicarErro, hora, resumo, TABELA } from '../lib/console-sql';
import { when } from '../lib/pam';
import { send, type Sent } from '../lib/send';

export type ConsoleResource = { id: string; name: string; access?: { level: 'READ' | 'WRITE'; expiresAt: string } };
type Result = { level: 'READ' | 'WRITE'; command: string; rowCount: number; columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; durationMs: number };

const NIVEL = { READ: 'Leitura', WRITE: 'Escrita' };

// O navegador só manda o recurso e o texto; quem decide o que o comando pode fazer é o papel do banco daquele recurso
export function ConsoleForm({ resources }: { resources: ConsoleResource[] }) {
  const [resourceId, setResourceId] = useState(resources.find((r) => r.access)?.id ?? resources[0]?.id ?? '');
  const [sql, setSql] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const resource = resources.find((r) => r.id === resourceId);
  const nome = resource?.name ?? '';

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSent(await send('/console/execute', { resourceId, sql }));
    setBusy(false);
  }

  const result = sent?.ok ? (sent.data as Result) : null;
  const erro = sent && !sent.ok ? explicarErro(sent.message, nome) : null;
  return (
    <form className="console-sql" onSubmit={run}>
      <fieldset className="recursos">
        <legend>Em qual recurso?</legend>
        {resources.map((r) => (
          <label key={r.id} className="recurso">
            <input type="radio" name="recurso" value={r.id} checked={r.id === resourceId} onChange={() => {
              setResourceId(r.id);
              setSent(null);
            }} />
            <strong>{r.name}</strong>
            <span className={r.access ? 'recurso-ok' : undefined}>
              {r.access ? `${NIVEL[r.access.level]} até ${hora(r.access.expiresAt)}` : 'Sem acesso'}
            </span>
          </label>
        ))}
      </fieldset>

      {resource?.access?.level === 'WRITE' ? (
        <p className="access access-ok">Acesso de <strong>Escrita</strong> a {nome} até {when(resource.access.expiresAt)}: pode consultar e alterar a tabela loja.{TABELA[nome]}.</p>
      ) : resource?.access ? (
        <p className="access access-ok">
          Acesso de <strong>Leitura</strong> a {nome} até {when(resource.access.expiresAt)}: pode consultar a tabela loja.{TABELA[nome]}; alterar, não.{' '}
          <Link href={`/pedidos?recurso=${resourceId}&nivel=WRITE`}>Pedir escrita em {nome}</Link>
        </p>
      ) : (
        <p className="access">
          Sem acesso a {nome} agora. <Link href={`/pedidos?recurso=${resourceId}`}>Pedir acesso a {nome}</Link>
        </p>
      )}

      <div className="exemplos">
        {(EXEMPLOS[nome] ?? []).map((g) => (
          <div key={g.nome} className={`exemplo exemplo-${g.tom}`} role="group" aria-label={`Exemplos: ${g.nome}`}>
            <p>
              <span className="exemplo-tag">{g.nome}</span> {g.dica}
            </p>
            {g.itens.map(([label, text]) => (
              <button key={label} type="button" className="button button-quiet button-small" onClick={() => setSql(text)}>
                {label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="terminal">
        <div className="terminal-bar">
          <span>loja.{TABELA[nome] ?? '…'}</span>
          <span>{resource?.access ? NIVEL[resource.access.level] : 'sem acesso'}</span>
        </div>
        <label className="terminal-campo">
          <span>Seu comando SQL (um por vez)</span>
          <textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={4} maxLength={2000} required spellCheck={false}
            placeholder="Clique num exemplo acima ou escreva aqui"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
            }} />
        </label>
        <div className="terminal-acoes">
          <span>Ctrl + Enter também executa</span>
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Executando…' : 'Executar no banco'}
          </button>
        </div>
      </div>

      {erro && (
        <div className="alert console-erro" role="alert">
          <strong>{erro.titulo}</strong>
          <p>{erro.texto}</p>
          {erro.banco && <p className="console-banco">Resposta do PostgreSQL · {erro.banco}</p>}
        </div>
      )}
      {result && (
        <p className="notice" role="status">
          <strong>{resumo(result.command, result.rowCount)}</strong> em {result.durationMs} ms{result.truncated ? ', mostrando 100' : ''} · código da execução <code>{sent?.requestId}</code>
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
