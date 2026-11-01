'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { send } from '../lib/send';

type Reason = { title: string; field: string; min: number };
type Props = { label: string; path: string; reason?: Reason; primary?: boolean; disabled?: boolean };

// Uma ação de escrita por botão; depois do sucesso o servidor remonta a tela com o estado novo do banco.
// Com motivo, abre um <dialog> nativo: o navegador prende o foco dentro dele e o Esc fecha
export function ActionButton({ label, path, reason, primary, disabled }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body?: Record<string, string>) {
    setBusy(true);
    setError(null);
    const sent = await send(path, body);
    setBusy(false);
    if (!sent.ok) return setError(sent.message);
    dialog.current?.close();
    router.refresh();
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run({ [reason!.field]: String(new FormData(event.currentTarget).get('reason')) });
  }

  const alert = error && (
    <p className="alert" role="alert">
      {error}
    </p>
  );
  return (
    <>
      <button
        type="button"
        className={primary ? 'button' : 'button button-quiet'}
        disabled={busy || disabled}
        onClick={() => (reason ? dialog.current?.showModal() : run())}
      >
        {busy && !reason ? 'Enviando…' : label}
      </button>
      {!reason && alert}
      {reason && (
        <dialog ref={dialog} className="panel" aria-labelledby={titleId}>
          <form className="form" onSubmit={confirm}>
            <h2 id={titleId}>{reason.title}</h2>
            <label className="field">
              Motivo (fica na trilha de auditoria)
              <textarea name="reason" minLength={reason.min} maxLength={500} rows={3} required />
            </label>
            {alert}
            <div className="row">
              <button type="button" className="button button-quiet" onClick={() => dialog.current?.close()}>
                Voltar
              </button>
              <button type="submit" className="button" disabled={busy}>
                {busy ? 'Enviando…' : label}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
