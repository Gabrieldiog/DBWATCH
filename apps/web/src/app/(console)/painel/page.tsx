import type { Metadata } from 'next';
import { ROLE_LABEL } from '../../../lib/console';
import { requireMe } from '../../../lib/session';

export const metadata: Metadata = { title: 'Visão geral' };

export default async function Painel() {
  // Cada página confere a sessão de novo: na navegação entre telas o Next não refaz o layout
  const me = await requireMe();
  const roles = me.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ');
  return (
    <main className="console-page">
      <h1>Visão geral</h1>
      <p>
        Olá, {me.displayName.split(' ')[0]}. Você entrou com o papel {roles}. O menu ao lado mostra só as áreas que
        esse papel libera.
      </p>
      <h2>Suas permissões</h2>
      <ul className="chips">
        {me.permissions.map((p) => (
          <li key={p}>
            <code>{p}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
