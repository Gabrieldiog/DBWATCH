'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loginUrl } from '../lib/console';

type Report = { intact: boolean; checked: number; firstBrokenPosition: number | null };

// O banco recalcula a cadeia de hash inteira; a própria verificação entra na trilha, por isso a tabela é redesenhada
export function VerifyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | 'erro' | null>(null);

  async function verify() {
    setBusy(true);
    const res = await fetch('/api/audit/verify').catch(() => null);
    setBusy(false);
    if (res?.status === 401) return window.location.assign(loginUrl(window.location.pathname, true));
    setReport(res?.ok ? ((await res.json()) as Report) : 'erro');
    router.refresh();
  }

  return (
    <div className="row">
      <button type="button" className="button" onClick={verify} disabled={busy}>
        {busy ? 'Verificando…' : 'Verificar integridade'}
      </button>
      {report === 'erro' && (
        <p className="alert" role="alert">
          Não foi possível verificar agora. Tente de novo.
        </p>
      )}
      {report && report !== 'erro' && (
        <p className={report.intact ? 'notice' : 'alert'} role={report.intact ? 'status' : 'alert'}>
          {report.intact
            ? `Cadeia íntegra: ${report.checked} registros conferidos, nenhum alterado.`
            : `Cadeia adulterada: o registro #${report.firstBrokenPosition} não bate com o hash guardado.`}
        </p>
      )}
    </div>
  );
}
