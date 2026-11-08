'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { when } from '../lib/pam';
import { send, type Sent } from '../lib/send';

export type ConsoleResource = { id: string; name: string; access?: { level: 'READ' | 'WRITE'; expiresAt: string } };
type Result = { level: 'READ' | 'WRITE'; command: string; rowCount: number; columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; durationMs: number };

// SQL pronto para a apresentação, em três grupos: o que a Leitura faz, o que só a Escrita faz e o que o banco recusa
// sempre (outra tabela, DDL). São só atalhos para o campo de texto; quem decide é o banco
type Grupo = 'Ler' | 'Alterar (precisa de Escrita)' | 'O banco recusa';
const EXEMPLOS: Record<string, Record<Grupo, [string, string][]>> = {
  Clientes: {
    Ler: [
      ['Clientes de Goiânia', "SELECT id, nome, email FROM loja.clientes WHERE cidade = 'Goiânia' ORDER BY id LIMIT 20"],
      ['Clientes por cidade', 'SELECT cidade, count(*) AS clientes FROM loja.clientes GROUP BY cidade ORDER BY clientes DESC'],
      ['Ver o cliente 7', 'SELECT id, nome, cidade FROM loja.clientes WHERE id = 7'],
    ],
    'Alterar (precisa de Escrita)': [
      ['Mudar a cidade de um cliente', "UPDATE loja.clientes SET cidade = 'Anápolis' WHERE id = 7 RETURNING id, nome, cidade"],
    ],
    'O banco recusa': [
      ['Apagar pedidos (outra tabela)', 'DELETE FROM loja.pedidos WHERE id = 1'],
      ['Apagar a tabela', 'DROP TABLE loja.clientes'],
    ],
  },
  'Catálogo de produtos': {
    Ler: [
      ['Produtos mais caros', 'SELECT id, nome, categoria, preco FROM loja.produtos ORDER BY preco DESC LIMIT 10'],
      ['Preço médio por categoria', 'SELECT categoria, count(*) AS produtos, round(avg(preco), 2) AS preco_medio FROM loja.produtos GROUP BY categoria ORDER BY categoria'],
    ],
    'Alterar (precisa de Escrita)': [
      ['Reajustar Bebidas em 10%', "UPDATE loja.produtos SET preco = round(preco * 1.1, 2) WHERE categoria = 'Bebidas' RETURNING id, nome, preco"],
    ],
    'O banco recusa': [['Mexer nos clientes (outra tabela)', "UPDATE loja.clientes SET nome = 'x' WHERE id = 1"]],
  },
  Financeiro: {
    Ler: [
      ['Faturamento por mês', "SELECT date_trunc('month', criado_em)::date AS mes, count(*) AS pedidos, sum(valor) AS total FROM loja.pedidos GROUP BY 1 ORDER BY 1"],
      ['Maiores pedidos', 'SELECT id, cliente_id, valor, criado_em FROM loja.pedidos ORDER BY valor DESC LIMIT 10'],
    ],
    'Alterar (precisa de Escrita)': [
      ['Lançar um pedido', 'INSERT INTO loja.pedidos (id, cliente_id, valor, criado_em) VALUES (9001, 7, 99.90, now()) ON CONFLICT (id) DO NOTHING RETURNING *'],
    ],
    'O banco recusa': [
      ['Pedidos com o nome do cliente (outra tabela)', 'SELECT p.id, c.nome, p.valor FROM loja.pedidos p JOIN loja.clientes c ON c.id = p.cliente_id LIMIT 10'],
      ['Esvaziar a tabela', 'TRUNCATE loja.pedidos'],
    ],
  },
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
      {resource?.access?.level === 'WRITE' ? (
        <p className="access access-ok">Você tem acesso de Escrita a {resource.name} até {when(resource.access.expiresAt)}: pode ler e alterar.</p>
      ) : resource?.access ? (
        <p className="access access-ok">
          Você tem acesso de Leitura a {resource.name} até {when(resource.access.expiresAt)}: pode consultar, e o banco recusa qualquer alteração.{' '}
          <Link href={`/pedidos?recurso=${resourceId}&nivel=WRITE`}>Pedir escrita em {resource.name}</Link>
        </p>
      ) : (
        <p className="access">
          Sem acesso a {resource?.name} agora.{' '}
          <Link href={`/pedidos?recurso=${resourceId}`}>Pedir acesso a {resource?.name}</Link>
        </p>
      )}
      {Object.entries(EXEMPLOS[resource?.name ?? ''] ?? {}).map(([grupo, exemplos]) => (
        <div key={grupo} className="row console-exemplos" role="group" aria-label={`Exemplos: ${grupo}`}>
          <span className="console-grupo">{grupo}</span>
          {exemplos.map(([label, text]) => (
            <button key={label} type="button" className="button button-quiet button-small" onClick={() => setSql(text)}>
              {label}
            </button>
          ))}
        </div>
      ))}
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
