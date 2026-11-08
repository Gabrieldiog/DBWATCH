import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import { ActionButton } from '../../../components/action-button';
import { BreakGlassForm } from '../../../components/break-glass-form';
import { Badge } from '../../../components/badge';
import { RequestForm } from '../../../components/request-form';
import { approvals, LEVEL, minutes, STATUS, when, type AccessRequest, type Approver, type Resource } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Pedir acesso' };

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
          <li><strong>Recurso:</strong> uma parte dos dados da loja fictícia (Catálogo, Clientes ou Financeiro).</li>
          <li><strong>Sensibilidade:</strong> baixa e média precisam de uma aprovação; alta precisa de duas pessoas diferentes.</li>
          <li><strong>Duração máxima:</strong> quanto mais sensível o dado, menor o tempo (Catálogo 2 h, Clientes 1 h, Financeiro 30 min). O acesso some sozinho no fim.</li>
          <li><strong>Leitura ou escrita:</strong> as consultas do catálogo são só de leitura; o nível escrita fica registrado no pedido.</li>
          <li><strong>Quem vai aprovar:</strong> só a pessoa escolhida decide; o banco recusa a decisão de qualquer outra.</li>
          <li>Um pedido pendente por recurso: o banco recusa o segundo.</li>
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
              {mine.map((r) => (
                <tr key={r.id}>
                  <td data-label="Recurso">{r.resource.name}</td>
                  <td data-label="Nível e duração">
                    {LEVEL[r.accessLevel]} · {minutes(r.requestedMinutes)}
                  </td>
                  <td data-label="Quem aprova">{r.approver?.displayName ?? 'Qualquer aprovador'}</td>
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
