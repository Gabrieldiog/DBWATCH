import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoutButton } from '../../components/logout-button';
import { NavLink } from '../../components/nav-link';
import { ThemeToggle } from '../../components/theme-toggle';
import { forbiddenPath, initials, navFor, ROLE_LABEL } from '../../lib/console';
import { requireMe } from '../../lib/session';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  // Primeira barreira da tela (a página confere de novo e a API é quem nega de verdade): fora do papel, 404 real
  if (forbiddenPath((await headers()).get('x-dbwatch-path') ?? '', me.permissions)) notFound();
  return (
    <div className="console">
      {/* Primeiro foco da página: quem navega por teclado pula os itens do menu */}
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <nav className="sidebar" aria-label="Principal">
        <Link href="/painel" className="brand">
          <Image src="/dbwatch-icon.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
          DBWATCH
        </Link>
        {navFor(me.permissions).map(({ group, items }) => (
          <div key={group || 'base'}>
            {group && <p className="sidebar-group">{group}</p>}
            <ul>
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="me">
          <span className="avatar" aria-hidden="true">
            {initials(me.displayName)}
          </span>
          <div>
            {me.displayName}
            <small>{me.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</small>
          </div>
        </div>
        <LogoutButton />
        <ThemeToggle />
      </nav>
      <div className="console-main" id="conteudo" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
