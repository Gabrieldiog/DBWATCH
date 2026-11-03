import type { Metadata } from 'next';
import { ActionButton } from '../../../components/action-button';
import { Badge } from '../../../components/badge';
import { UserForm } from '../../../components/user-form';
import { ROLE_LABEL } from '../../../lib/console';
import type { Tone } from '../../../lib/pam';
import { when } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Usuários' };
type User = { id: string; email: string; displayName: string; status: string; lastLoginAt: string | null; roles: string[] };
const USER_STATUS: Record<string, [string, Tone]> = { ACTIVE: ['Ativo', 'ok'], DISABLED: ['Desativado', 'muted'] };

export default async function Usuarios() {
  const me = await requirePermission('user:manage');
  const canAssign = me.permissions.includes('role:assign');
  const users = await apiGet<User[]>('/users');
  return (
    <main className="console-page">
      <h1>Usuários</h1>
      <p>
        As regras ficam no banco: ninguém dá papel a si mesmo e o último ADMIN ativo não pode sair. Desativar alguém
        encerra todas as sessões dessa pessoa na mesma transação.
      </p>
      <UserForm />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              <th scope="col">Papéis</th>
              <th scope="col">Estado</th>
              <th scope="col">Último acesso</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td data-label="Pessoa">
                  {u.displayName}
                  <small className="note">{u.email}</small>
                </td>
                <td data-label="Papéis">
                  <div className="row">
                    {u.roles.map((r) => (
                      <span key={r} className="chips">
                        <code>{ROLE_LABEL[r] ?? r}</code>
                        {canAssign && (
                          <ActionButton label={`Remover ${ROLE_LABEL[r] ?? r}`} path={`/users/${u.id}/roles/${r}`} method="DELETE" small />
                        )}
                      </span>
                    ))}
                    {canAssign &&
                      Object.keys(ROLE_LABEL)
                        .filter((r) => !u.roles.includes(r))
                        .map((r) => (
                          <ActionButton key={r} label={`+ ${ROLE_LABEL[r]}`} path={`/users/${u.id}/roles`} body={{ role: r }} small />
                        ))}
                  </div>
                </td>
                <td data-label="Estado">
                  <Badge entry={USER_STATUS[u.status]} fallback={u.status} />
                </td>
                <td data-label="Último acesso">{u.lastLoginAt ? when(u.lastLoginAt) : 'nunca'}</td>
                <td>
                  <div className="row">
                    <ActionButton
                      label={u.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                      path={`/users/${u.id}/status`}
                      method="PATCH"
                      body={{ status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }}
                    />
                    <ActionButton label="Encerrar sessões" path={`/users/${u.id}/sessions`} method="DELETE" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
