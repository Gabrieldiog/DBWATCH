'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { loginErrorMessage, loginNotice, safeNext } from '../lib/login';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const notice = loginNotice(params.get('motivo'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (res.ok) return router.replace(next);
      setError(loginErrorMessage(res.status, await res.json().catch(() => null)));
    } catch {
      setError(loginErrorMessage(0, null));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
      {notice && !error && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <label className="field">
        E-mail
        <input name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        Senha
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button className="button" type="submit" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
