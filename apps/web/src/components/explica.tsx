import type { ReactNode } from 'react';

// "O que é isto?" de cada tela: <details> nativo, abre e fecha pelo teclado sem JavaScript
export function Explica({ children, titulo = 'O que é esta tela?' }: { children: ReactNode; titulo?: string }) {
  return (
    <details className="explica">
      <summary>{titulo}</summary>
      <div>{children}</div>
    </details>
  );
}
