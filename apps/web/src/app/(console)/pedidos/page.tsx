import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import { ActionButton } from '../../../components/action-button';
import { BreakGlassForm } from '../../../components/break-glass-form';
import { Badge } from '../../../components/badge';
import { RequestForm } from '../../../components/request-form';
import { approvals, LEVEL, minutes, STATUS, when, type AccessRequest, type Approver, type Resource } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Pedir acesso' };
const RECENT = 8;

// ?recurso= (e ?nivel=WRITE, do console) vêm dos links "Pedir acesso": o formulário já abre no recurso e no nível certos
export default async function Pedidos({ searchParams }: { searchParams: Promise<{ recurso?: string; nivel?: string }> }) {
  const { recurso, nivel } = await searchParams;
  const me = await requirePermission('request:create');
  const [resources, mine, approvers] = await Promise.all([
    apiGet<Resource[]>('/resources'),
    apiGet<AccessRequest[]>('/requests/mine'),
    apiGet<Approver[]>('/requests/approvers'),
  ]);
  return (
    <main className="console-page">
      <h1>Pedir acesso</h1>
      <p>
        O acesso é temporário e passa por aprovação de quem você escolher. Recurso de sensibilidade alta precisa de duas
        pessoas diferentes.
      </p>
      <Explica>
        <ul>
          <li><strong>Quanto mais sensível, menos tempo:</strong> Catálogo até 2 h, Clientes 1 h, Financeiro 30 min. O acesso some sozinho no fim.</li>
          <li><strong>Leitura</strong> só consulta; <strong>Leitura e escrita</strong> também inclui e altera, pelo Console SQL. Apagar, ninguém apaga.</li>
          <li><strong>O banco garante:</strong> só a pessoa escolhida decide, e há um pedido pendente por recurso.</li>
        </ul>
      </Explica>
      <RequestForm resources={resources} approvers={approvers} initial={recurso} level={nivel} />
      {me.permissions.includes('breakglass:use') && (
        <section aria-labelledby="emergencia">
          <h2 id="emergencia">Emergência (break-glass)</h2>
          <p>
            Para incidente em andamento: leitura liberada na hora, sem esperar aprovação, por no máximo 15 minutos. É a
            única exceção à regra de que ninguém decide o próprio pedido, por isso dispara um alerta no Monitor e
            outra pessoa revisa depois.
          </p>
          <BreakGlassForm resources={resources} />
        </section>
      )}
      <h2>Meus pedidos</h2>
      {mine.length > RECENT && <p className="note">Os {RECENT} mais recentes. Todos ficam na auditoria.</p>}
      {mine.length === 0 ? (
        <p className="panel">Você ainda não fez nenhum pedido.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Recurso</th>
                <th scope="col">Nível e duração</th>
                <th scope="col">Quem aprova</th>
                <th scope="col">Pedido em</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mine.slice(0, RECENT).map((r) => (
                <tr key={r.id}>
                  <td data-label="Recurso">{r.resource.name}</td>
                  <td data-label="Nível e duração">
                    {LEVEL[r.accessLevel]} · {minutes(r.requestedMinutes)}
                  </td>
                  <td data-label="Quem aprova">{r.approver?.displayName ?? (r.breakGlass ? 'Emergência, sem aprovação' : 'Qualquer aprovador')}</td>
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
