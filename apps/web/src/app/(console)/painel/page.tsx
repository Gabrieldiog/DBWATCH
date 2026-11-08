import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIA, PAPEIS, PERMISSAO } from '../../../lib/ajuda';
import { navFor, ROLE_LABEL } from '../../../lib/console';
import { requireMe } from '../../../lib/session';

export const metadata: Metadata = { title: 'Visão geral' };

// O guia do DBWATCH: cada área que esta pessoa enxerga, o que é e para que serve, mais os papéis e as permissões em português
export default async function Painel() {
  // Cada página confere a sessão de novo: na navegação entre telas o Next não refaz o layout
  const me = await requireMe();
  const roles = me.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ');
  const areas = navFor(me.permissions).flatMap((g) => g.items).filter((i) => GUIA[i.href]);
  return (
    <main className="console-page">
      <h1>Visão geral</h1>
      <p>
        Olá, {me.displayName.split(' ')[0]}. O DBWATCH controla quem acessa dados sensíveis, por quanto tempo e com a
        aprovação de quem, e vigia o PostgreSQL enquanto isso acontece. As regras importantes moram dentro do banco: um
        erro na aplicação não basta para furá-las.
      </p>
      <p className="note">Você entrou com o papel {roles}. O menu mostra só as áreas que esse papel libera.</p>

      <h2>O que você pode fazer aqui</h2>
      <ul className="guia">
        {areas.map((a) => (
          <li key={a.href} className="panel">
            <h3>
              <Link href={a.href}>{a.label}</Link>
            </h3>
            <p>{GUIA[a.href]!.oque}</p>
            <p className="note">Para quê: {GUIA[a.href]!.serve}</p>
          </li>
        ))}
      </ul>

      <h2>Os papéis</h2>
      <p>Ninguém faz tudo sozinho, de propósito: se uma senha vazar, o estrago fica limitado ao papel dela.</p>
      <dl className="papeis">
        {PAPEIS.map(([papel, texto]) => (
          <div key={papel}>
            <dt>{papel}</dt>
            <dd>{texto}</dd>
          </div>
        ))}
      </dl>

      <h2>Suas permissões</h2>
      <ul className="permissoes">
        {me.permissions.map((p) => (
          <li key={p}>
            {PERMISSAO[p] ?? p} <code>{p}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
