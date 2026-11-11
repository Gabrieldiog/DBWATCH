import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import Link from 'next/link';
import { Badge } from '../../../components/badge';
import { VerifyButton } from '../../../components/verify-button';
import { auditQuery, OUTCOME, toQuery, type Entry } from '../../../lib/audit';
import { ACTION_LABEL, motivo } from '../../../lib/monitor';
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
      <p>O registro oficial de tudo que aconteceu, até o que foi negado. Ninguém altera nem apaga uma linha, nem o próprio sistema.</p>
      <Explica>
        <p>Cada linha é uma ação: quem fez, o quê, quando e o resultado. Cada registro guarda o hash do anterior; <strong>Verificar integridade</strong> recalcula a cadeia inteira no banco e aponta a primeira linha alterada, se houver. O código da execução junta tudo o que uma mesma requisição gravou.</p>
      </Explica>
      {me.permissions.includes('audit:verify') && <VerifyButton />}
      <form className="panel audit-filtros" method="get" action="/auditoria">
        <label className="field">
          Código da execução
          <input name="correlationId" defaultValue={filter.correlationId} size={38} />
        </label>
        <label className="field">
          Ação
          <select name="action" defaultValue={filter.action ?? ''}>
            <option value="">Todas</option>
            {Object.entries(ACTION_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
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
        <div className="audit-acoes">
          <button type="submit" className="button">
            Filtrar
          </button>
          <Link href="/auditoria">Limpar filtros</Link>
        </div>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {!error && page.items.length === 0 && <p className="panel">Nenhum registro com esses filtros.</p>}
      {page.items.length > 0 && (
        <div className="table-wrap">
          <table className="table audit-tabela">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Quando</th>
                <th scope="col">Quem</th>
                <th scope="col">O que aconteceu</th>
                <th scope="col">Resultado</th>
                <th scope="col">Código</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((e) => (
                <tr key={e.chainPosition}>
                  <td data-label="#">{e.chainPosition}</td>
                  <td data-label="Quando">{when(e.occurredAt)}</td>
                  <td data-label="Quem">{e.actorEmail ?? 'sistema'}</td>
                  <td data-label="O que aconteceu" className="wrap">
                    <strong>{ACTION_LABEL[e.action] ?? e.action}</strong>
                    {e.reason && <span className="audit-motivo">{motivo(e.reason)}</span>}
                    <small className="note">
                      <code>{e.action}</code>
                    </small>
                    {(e.resourceId || (e.metadata && Object.keys(e.metadata).length > 0)) && (
                      <details className="audit-dados">
                        <summary>Ver dados</summary>
                        <dl>
                          {e.resourceType && (
                            <div>
                              <dt>{e.resourceType}</dt>
                              <dd>{e.resourceId}</dd>
                            </div>
                          )}
                          {Object.entries(e.metadata ?? {}).map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </td>
                  <td data-label="Resultado">
                    <Badge entry={OUTCOME[e.outcome]} fallback={e.outcome} />
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
