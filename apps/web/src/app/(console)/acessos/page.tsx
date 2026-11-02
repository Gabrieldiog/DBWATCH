import type { Metadata } from 'next';
import { ActionButton } from '../../../components/action-button';
import { Badge } from '../../../components/badge';
import { Countdown } from '../../../components/countdown';
import { GRANT_STATE, LEVEL, when, type Grant } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Meus acessos' };

// Com "everyone", mostra de quem é cada acesso e o botão de revogar (só para quem tem grant:revoke)
function GrantTable({ grants, everyone }: { grants: Grant[]; everyone?: boolean }) {
  if (grants.length === 0) return <p className="panel">{everyone ? 'Nenhum acesso ativo agora.' : 'Você ainda não recebeu nenhum acesso.'}</p>;
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
  return (
    <main className="console-page">
      <h1>Meus acessos</h1>
      <p>O prazo é contado pelo relógio do banco: se o sistema parar, o acesso vence do mesmo jeito.</p>
      <GrantTable grants={mine} />
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
