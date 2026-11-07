'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { send } from '../lib/send';

// A API gera a senha inicial e guarda só o hash Argon2id; ela aparece aqui uma vez e some ao sair da tela.
// O usuário nasce sem papel nenhum
export function UserForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; secret?: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    const sent = await send('/users', data);
    setBusy(false);
    const secret = sent.ok ? (sent.data as { initialPassword?: string }).initialPassword : undefined;
    setResult(sent.ok ? { ok: true, message: `${String(data.email)} criado. Dê um papel para liberar o acesso.`, secret } : sent);
    if (!sent.ok) return;
    form.reset();
    router.refresh();
  }

  return (
    <form className="panel row" onSubmit={submit}>
      <label className="field">
        Nome
        <input name="displayName" maxLength={120} required />
      </label>
      <label className="field">
        E-mail
        <input name="email" type="email" maxLength={254} required />
      </label>
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Criando…' : 'Criar usuário'}
      </button>
      {result && (
        <p className={result.ok ? 'notice' : 'alert'} role={result.ok ? 'status' : 'alert'}>
          {result.message}
          {result.secret && (
            <>
              {' '}Senha inicial para entregar à pessoa (aparece só agora): <code className="secret">{result.secret}</code>
            </>
          )}
        </p>
      )}
    </form>
  );
}
