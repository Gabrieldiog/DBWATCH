import type { Metadata } from 'next';
import { ActionButton } from '../../../components/action-button';
import { Badge } from '../../../components/badge';
import { approvals, LEVEL, minutes, SENSITIVITY, when, type AccessRequest } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Aprovações' };

export default async function Aprovacoes() {
  const me = await requirePermission('request:review');
  const queue = await apiGet<AccessRequest[]>('/requests/queue');
  return (
    <main className="console-page">
      <h1>Aprovações</h1>
      <p>Pedidos pendentes, dos mais antigos aos mais novos. Os seus não aparecem: ninguém decide o próprio pedido.</p>
      {queue.length === 0 && <p className="panel">Nenhum pedido esperando decisão.</p>}
      <ul className="cards">
        {queue.map((r) => {
          const who = r.requester?.displayName ?? 'Solicitante';
          const iApproved = r.firstApprovedById === me.id;
          return (
            <li key={r.id} className="panel">
              <h2>
                {who} pede {LEVEL[r.accessLevel]?.toLowerCase()} em {r.resource.name}
              </h2>
              <p>
                <Badge entry={SENSITIVITY[r.resource.sensitivity]} fallback={r.resource.sensitivity} />{' '}
                {minutes(r.requestedMinutes)} · pedido em {when(r.createdAt)} {approvals(r) && `· ${approvals(r)}`}
              </p>
              <blockquote>{r.justification}</blockquote>
              {iApproved && <p className="notice">Você deu a primeira aprovação. A segunda precisa ser de outra pessoa.</p>}
              <div className="row">
                <ActionButton label="Aprovar" path={`/requests/${r.id}/approve`} primary disabled={iApproved} />
                <ActionButton
                  label="Rejeitar"
                  path={`/requests/${r.id}/reject`}
                  reason={{ title: `Rejeitar o pedido de ${who}`, field: 'note', min: 5 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
