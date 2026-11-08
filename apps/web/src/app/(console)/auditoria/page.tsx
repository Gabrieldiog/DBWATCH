import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import Link from 'next/link';
import { Badge } from '../../../components/badge';
import { VerifyButton } from '../../../components/verify-button';
import { auditQuery, OUTCOME, toQuery, type Entry } from '../../../lib/audit';
import { when } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Auditoria' };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Auditoria({ searchParams }: Props) {
  const me = await requirePermission('audit:read');
  const { filter, qs, error } = auditQuery(await searchParams);
  const page = error ? { items: [], nextCursor: null } : await apiGet<{ items: Entry[]; nextCursor: number | null }>(`/audit?${qs}`);
  const older = page.nextCursor && `/auditoria?${toQuery({ ...filter, cursor: String(page.nextCursor) })}`;
  return (
    <main className="console-page">
      <h1>Auditoria</h1>
      <p>
        Cada registro guarda o hash do anterior. Ninguém altera nem apaga linhas, nem o próprio sistema; a verificação
        recalcula a cadeia inteira no banco.
      </p>
      <Explica>
        <p>Cada linha é uma ação: quem fez, o quê, quando e o resultado (sucesso, negado ou falha). O código da execução liga tudo o que uma mesma requisição gravou.</p>
        <p>A trilha só cresce: nem a aplicação consegue alterar ou apagar uma linha. Cada registro guarda o hash do anterior; <strong>Verificar integridade</strong> recalcula a cadeia inteira dentro do banco e aponta a primeira linha alterada, se houver.</p>
      </Explica>
      {me.permissions.includes('audit:verify') && <VerifyButton />}
      <form className="panel row" method="get" action="/auditoria">
        <label className="field">
          Código da execução
          <input name="correlationId" defaultValue={filter.correlationId} size={38} />
        </label>
        <label className="field">
          Ação
          <input name="action" defaultValue={filter.action} placeholder="pam.query_execute" />
        </label>
        <label className="field">
          Pessoa (e-mail)
          <input name="actorEmail" type="email" defaultValue={filter.actorEmail} placeholder="diego.solicitante@dbwatch.test" />
        </label>
        <label className="field">
          De
          <input name="from" type="datetime-local" defaultValue={filter.from} />
        </label>
        <label className="field">
          Até
          <input name="to" type="datetime-local" defaultValue={filter.to} />
        </label>
        <label className="field">
          Resultado
          <select name="outcome" defaultValue={filter.outcome ?? ''}>
            <option value="">Todos</option>
            {Object.entries(OUTCOME).map(([code, [label]]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button">
          Filtrar
        </button>
        <Link href="/auditoria">Limpar filtros</Link>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {!error && page.items.length === 0 && <p className="panel">Nenhum registro com esses filtros.</p>}
      {page.items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Quando</th>
                <th scope="col">Quem</th>
                <th scope="col">Ação</th>
                <th scope="col">Resultado</th>
                <th scope="col">Detalhes</th>
                <th scope="col">Código</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((e) => (
                <tr key={e.chainPosition}>
                  <td data-label="#">{e.chainPosition}</td>
                  <td data-label="Quando">{when(e.occurredAt)}</td>
                  <td data-label="Quem">{e.actorEmail ?? 'sistema'}</td>
                  <td data-label="Ação">
                    <code>{e.action}</code>
                  </td>
                  <td data-label="Resultado">
                    <Badge entry={OUTCOME[e.outcome]} fallback={e.outcome} />
                  </td>
                  <td data-label="Detalhes" className="wrap">
                    {[e.resourceType, e.resourceId, e.reason].filter(Boolean).join(' · ')}
                    {e.metadata && Object.keys(e.metadata).length > 0 && <small className="note">{JSON.stringify(e.metadata)}</small>}
                  </td>
                  <td data-label="Código">
                    {e.correlationId && (
                      <Link href={`/auditoria?correlationId=${e.correlationId}`} aria-label={`Filtrar pelo código ${e.correlationId}`}>
                        <code>{e.correlationId.slice(0, 8)}</code>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {older && <Link href={older}>Registros mais antigos</Link>}
    </main>
  );
}
