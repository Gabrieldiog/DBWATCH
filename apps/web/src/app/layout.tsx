import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'DBWATCH',
  description: 'Acessos privilegiados e PostgreSQL sob vigilância',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#050E1E', color: '#E4EEF7', fontFamily: 'system-ui' }}>
        {children}
      </body>
    </html>
  );
}
