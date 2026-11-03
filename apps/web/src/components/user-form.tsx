'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { send } from '../lib/send';

// A senha vai uma vez para a API, que guarda só o hash Argon2id; o usuário nasce sem papel nenhum
export function UserForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    const sent = await send('/users', data);
    setBusy(false);
    setResult(sent.ok ? { ok: true, message: `${String(data.email)} criado. Dê um papel para liberar o acesso.` } : sent);
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
      <label className="field">
        Senha inicial (12 ou mais caracteres)
        <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required />
      </label>
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Criando…' : 'Criar usuário'}
      </button>
      {result && (
        <p className={result.ok ? 'notice' : 'alert'} role={result.ok ? 'status' : 'alert'}>
          {result.message}
        </p>
      )}
    </form>
  );
}
