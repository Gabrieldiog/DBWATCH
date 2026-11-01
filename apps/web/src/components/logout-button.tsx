'use client';

import { useState } from 'react';

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setBusy(true);
    setFailed(false);
    const res = await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    // 401 também conta como saída: a sessão já não existia no banco
    // Navegação completa (não router.push) descarta as telas do console guardadas na memória do navegador
    if (res && (res.ok || res.status === 401)) return window.location.assign('/entrar?motivo=saiu');
    setBusy(false);
    setFailed(true);
  }

  return (
    <>
      <button type="button" className="button button-quiet" onClick={logout} disabled={busy}>
        {busy ? 'Saindo…' : 'Sair'}
      </button>
      {failed && (
        <p className="alert" role="alert">
          Não foi possível sair agora. Confira a conexão e tente de novo.
        </p>
      )}
    </>
  );
}
