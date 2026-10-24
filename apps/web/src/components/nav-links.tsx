'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Visão geral' },
  { href: '/testes', label: 'Testes' },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Principal">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
