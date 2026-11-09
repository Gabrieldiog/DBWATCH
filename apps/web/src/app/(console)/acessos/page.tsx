import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import { ActionButton } from '../../../components/action-button';
import { Badge } from '../../../components/badge';
import { Countdown } from '../../../components/countdown';
import { GRANT_STATE, LEVEL, when, type Grant } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Meus acessos' };

// Com "everyone", mostra de quem é cada acesso e o botão de revogar (só para quem tem grant:revoke)
function GrantTable({ grants, everyone }: { grants: Grant[]; everyone?: boolean }) {
  if (grants.length === 0) return <p className="panel">{everyone ? 'Nenhum acesso ativo agora.' : 'Nenhum acesso valendo agora.'}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {everyone && <th scope="col">Pessoa</th>}
            <th scope="col">Recurso</th>
            <th scope="col">Nível</th>
            <th scope="col">Termina em</th>
            <th scope="col">Estado e tempo restante</th>
            {everyone && (
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.id}>
              {everyone && <td data-label="Pessoa">{g.user?.email}</td>}
              <td data-label="Recurso">{g.resource.name}</td>
              <td data-label="Nível">{LEVEL[g.accessLevel]}</td>
              <td data-label="Termina em">{when(g.expiresAt)}</td>
              <td data-label="Estado">
                <Badge entry={GRANT_STATE[g.state]} fallback={g.state} />{' '}
                {g.state === 'ACTIVE' && <Countdown seconds={g.secondsLeft} />}
              </td>
              {everyone && (
                <td>
                  <ActionButton
                    label="Revogar"
                    path={`/grants/${g.id}/revoke`}
                    reason={{ title: `Revogar o acesso de ${g.user?.email} a ${g.resource.name}`, field: 'reason', min: 5 }}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Acessos() {
  const me = await requirePermission('grant:read:own', 'grant:revoke');
  const canRevoke = me.permissions.includes('grant:revoke');
  const [mine, active] = await Promise.all([
    apiGet<Grant[]>('/grants/mine'),
    canRevoke ? apiGet<Grant[]>('/grants/active') : Promise.resolve([]),
  ]);
  // PK-28: o que vale agora fica em cima; o histórico (revogados e vencidos) fica recolhido
  const live = mine.filter((g) => g.state === 'ACTIVE' || g.state === 'SCHEDULED');
  const past = mine.filter((g) => !live.includes(g));
  return (
    <main className="console-page">
      <h1>Meus acessos</h1>
      <p>Cada acesso vence sozinho pelo relógio do banco, mesmo se o sistema parar.</p>
      <Explica>
        <p>Quem aprova pode revogar antes. O banco impede dois acessos da mesma pessoa ao mesmo recurso no mesmo período (EXCLUDE).</p>
      </Explica>
      <h2>Valendo agora</h2>
      <GrantTable grants={live} />
      {past.length > 0 && (
        <details className="mais-antigos">
          <summary>Acessos encerrados ({past.length})</summary>
          <GrantTable grants={past.slice(0, 10)} />
          {past.length > 10 && <p className="note">Os 10 mais recentes. Todos ficam na auditoria.</p>}
        </details>
      )}
      {canRevoke && (
        <>
          <h2>Acessos ativos de todos</h2>
          <p>A revogação vale na próxima requisição da pessoa e fica na trilha de auditoria com o motivo.</p>
          <GrantTable grants={active} everyone />
        </>
      )}
    </main>
  );
}
