'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { send } from '../lib/send';

// Uma ação de escrita por botão; depois do sucesso o servidor remonta a tela com o estado novo do banco
export function ActionButton({ label, path }: { label: string; path: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const sent = await send(path);
    setBusy(false);
    if (!sent.ok) return setError(sent.message);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="button button-quiet" disabled={busy} onClick={run}>
        {busy ? 'Enviando…' : label}
      </button>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
