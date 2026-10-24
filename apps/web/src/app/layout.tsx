import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks } from '../components/nav-links';
import { ThemeToggle } from '../components/theme-toggle';
import { themeInitScript } from '../lib/theme';
import './globals.css';

// Baixadas no build e servidas pelo próprio app: o navegador do visitante não consulta o Google
const display = Sora({ subsets: ['latin'], weight: ['400', '600', '800'], variable: '--font-display' });
const text = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-text' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: { default: 'DBWATCH', template: '%s · DBWATCH' },
  description: 'Acessos privilegiados e PostgreSQL sob vigilância',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${text.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand" aria-label="DBWATCH, ir para a visão geral">
              <Image src="/dbwatch-icon.png" alt="" width={44} height={44} priority />
              <span className="wordmark" aria-hidden>
                <b>DB</b>
                <span>WATCH</span>
              </span>
            </Link>
            <NavLinks />
            <ThemeToggle />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
