import type { Metadata } from 'next';
import { ActionButton } from '../../../components/action-button';
import { Badge } from '../../../components/badge';
import { RequestForm } from '../../../components/request-form';
import { approvals, LEVEL, minutes, STATUS, when, type AccessRequest, type Resource } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Pedir acesso' };

export default async function Pedidos() {
  await requirePermission('request:create');
  const [resources, mine] = await Promise.all([
    apiGet<Resource[]>('/resources'),
    apiGet<AccessRequest[]>('/requests/mine'),
  ]);
  return (
    <main className="console-page">
      <h1>Pedir acesso</h1>
      <p>
        O acesso é temporário e passa por aprovação. Recurso de sensibilidade alta precisa de duas pessoas
        diferentes.
      </p>
      <RequestForm resources={resources} />
      <h2>Meus pedidos</h2>
      {mine.length === 0 ? (
        <p className="panel">Você ainda não fez nenhum pedido.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Recurso</th>
                <th scope="col">Nível e duração</th>
                <th scope="col">Pedido em</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.id}>
                  <td data-label="Recurso">{r.resource.name}</td>
                  <td data-label="Nível e duração">
                    {LEVEL[r.accessLevel]} · {minutes(r.requestedMinutes)}
                  </td>
                  <td data-label="Pedido em">{when(r.createdAt)}</td>
                  <td data-label="Estado">
                    <Badge entry={STATUS[r.status]} fallback={r.status} /> {approvals(r)}
                    {r.decisionNote && <small className="note">Motivo: {r.decisionNote}</small>}
                  </td>
                  <td>
                    {r.status === 'PENDING' && (
                      <ActionButton label="Cancelar" path={`/requests/${r.id}/cancel`} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
