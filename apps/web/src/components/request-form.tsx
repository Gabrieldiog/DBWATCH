'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { minutes, SENSITIVITY, type Resource } from '../lib/pam';
import { send } from '../lib/send';

export function RequestForm({ resources, initial, level }: { resources: Resource[]; initial?: string; level?: string }) {
  const router = useRouter();
  const [resourceId, setResourceId] = useState(resources.find((r) => r.id === initial)?.id ?? resources[0]?.id ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const max = resources.find((r) => r.id === resourceId)?.maxGrantMinutes ?? 5;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    const sent = await send('/requests', {
      resourceId,
      accessLevel: data.get('accessLevel'),
      requestedMinutes: Number(data.get('requestedMinutes')),
      justification: text,
    });
    setBusy(false);
    setResult(
      sent.ok ? { ok: true, message: 'Pedido enviado. Ele aparece abaixo como Pendente.' } : sent,
    );
    if (!sent.ok) return;
    setText('');
    form.reset();
    router.refresh();
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <label className="field">
        Recurso
        <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} required>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · sensibilidade {SENSITIVITY[r.sensitivity]?.[0] ?? r.sensitivity} · até{' '}
              {minutes(r.maxGrantMinutes)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="field">
        <legend>Nível</legend>
        <label>
          <input type="radio" name="accessLevel" value="READ" defaultChecked={level !== 'WRITE'} /> Leitura
        </label>
        <label>
          <input type="radio" name="accessLevel" value="WRITE" defaultChecked={level === 'WRITE'} /> Escrita
        </label>
      </fieldset>
      <label className="field">
        Duração em minutos (de 5 a {max})
        <input
          key={resourceId}
          name="requestedMinutes"
          type="number"
          min={5}
          max={max}
          defaultValue={Math.min(30, max)}
          required
        />
      </label>
      <label className="field">
        Justificativa
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          minLength={20}
          maxLength={500}
          rows={3}
          required
        />
        <small aria-live="polite">
          {text.trim().length < 20
            ? `Faltam ${20 - text.trim().length} caracteres`
            : `${text.length}/500`}
        </small>
      </label>
      {result && (
        <p className={result.ok ? 'notice' : 'alert'} role={result.ok ? 'status' : 'alert'}>
          {result.message}
        </p>
      )}
      <button className="button" type="submit" disabled={busy || !resourceId}>
        {busy ? 'Enviando…' : 'Pedir acesso'}
      </button>
    </form>
  );
}
