import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { themeInitScript } from '../lib/theme';
import './globals.css';

// Arquivos no repositório (licença OFL): o navegador nunca consulta servidor de fontes de terceiros
const sora = localFont({ src: './fonts/sora.woff2', weight: '500 700', variable: '--font-display' });
const plexSans = localFont({ src: './fonts/plex-sans.woff2', weight: '400 600', variable: '--font-text' });
const plexMono = localFont({
  src: [
    { path: './fonts/plex-mono-400.woff2', weight: '400' },
    { path: './fonts/plex-mono-500.woff2', weight: '500' },
  ],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: { default: 'DBWATCH', template: '%s | DBWATCH' },
  description: 'Acessos privilegiados e PostgreSQL sob vigilância',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
