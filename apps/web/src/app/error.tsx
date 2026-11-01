'use client';

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  // Nada do erro aparece na tela: em produção o Next só manda um código, e detalhe do banco não vaza
  return (
    <main className="console-page">
      <h1>Algo deu errado</h1>
      <p>O servidor não conseguiu montar esta tela. Tente de novo em instantes.</p>
      <div>
        <button type="button" className="button" onClick={() => retry()}>
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
