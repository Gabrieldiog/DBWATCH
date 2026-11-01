'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '../lib/console';

export function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link href={item.href} aria-current={current ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={item.icon} />
      </svg>
      {item.label}
    </Link>
  );
}
