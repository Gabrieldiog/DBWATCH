import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import { ActionButton } from '../../../components/action-button';
import { device } from '../../../lib/console';
import { when } from '../../../lib/pam';
import { apiGet, requireMe } from '../../../lib/session';

export const metadata: Metadata = { title: 'Minhas sessões' };
type Session = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; ip: string | null; userAgent: string | null; current: boolean };

// Cada linha é uma sessão viva em iam.sessions; encerrar grava revoked_at no banco e o cookie daquele aparelho para de valer
export default async function Sessoes() {
  await requireMe();
  const sessions = await apiGet<Session[]>('/auth/sessions');
  return (
    <main className="console-page">
      <h1>Minhas sessões</h1>
      <p>Onde sua conta está aberta agora. Esqueceu um computador logado? Encerre aqui.</p>
      <Explica>
        <p>A sessão fica guardada no banco, não só no navegador: encerrar grava a revogação, e o próximo clique naquele aparelho volta para o login.</p>
      </Explica>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Aparelho</th>
              <th scope="col">IP</th>
              <th scope="col">Entrou em</th>
              <th scope="col">Último uso</th>
              <th scope="col">Expira em</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td data-label="Aparelho" title={s.userAgent ?? undefined}>
                  {device(s.userAgent)}
                  {s.current && <small className="note">Esta sessão</small>}
                </td>
                <td data-label="IP">{s.ip ?? 'sem registro'}</td>
                <td data-label="Entrou em">{when(s.createdAt)}</td>
                <td data-label="Último uso">{when(s.lastSeenAt)}</td>
                <td data-label="Expira em">{when(s.expiresAt)}</td>
                <td>
                  {/* A atual sai pelo botão Sair, que também apaga o cookie deste navegador */}
                  {!s.current && <ActionButton label="Encerrar" path={`/auth/sessions/${s.id}`} method="DELETE" small />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
