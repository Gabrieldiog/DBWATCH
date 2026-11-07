import type { Metadata } from 'next';
import { ActionButton } from '../../../components/action-button';
import { Badge } from '../../../components/badge';
import { approvals, LEVEL, minutes, SENSITIVITY, when, type AccessRequest } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Aprovações' };
type BreakGlass = { id: string; justification: string; requestedMinutes: number; createdAt: string; requester: { id: string; email: string }; resource: { name: string } };

export default async function Aprovacoes() {
  const me = await requirePermission('request:review');
  const [queue, emergencies] = await Promise.all([
    apiGet<AccessRequest[]>('/requests/queue'),
    apiGet<BreakGlass[]>('/break-glass/pending'),
  ]);
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
      <h2>Break-glass para revisar</h2>
      <p>
        Acessos de emergência que já aconteceram sem aprovação. A revisão é de outra pessoa (o banco recusa quem abriu)
        e a nota fica na trilha de auditoria.
      </p>
      {emergencies.length === 0 && <p className="panel">Nenhum break-glass esperando revisão.</p>}
      <ul className="cards">
        {emergencies.map((b) => (
          <li key={b.id} className="panel break-glass">
            <h3>
              {b.requester.email} abriu leitura em {b.resource.name}
            </h3>
            <p>
              {minutes(b.requestedMinutes)} · aberto em {when(b.createdAt)}
            </p>
            <blockquote>{b.justification}</blockquote>
            <ActionButton
              label="Revisar"
              path={`/break-glass/${b.id}/review`}
              primary
              disabled={b.requester.id === me.id}
              reason={{ title: `Revisar o break-glass de ${b.requester.email}`, field: 'note', min: 5 }}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
