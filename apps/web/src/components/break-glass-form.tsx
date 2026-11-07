'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { type Resource } from '../lib/pam';
import { send } from '../lib/send';

const TIME = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

// Break-glass: acesso de leitura imediato, sem aprovação prévia. O banco limita a 15 min, exige 40 caracteres de
// justificativa e a permissão breakglass:use; a abertura vira alerta no Monitor e fica na fila de revisão
export function BreakGlassForm({ resources }: { resources: Resource[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    const sent = await send('/break-glass', {
      resourceId: data.get('resourceId'),
      minutes: Number(data.get('minutes')),
      justification: text,
    });
    setBusy(false);
    if (!sent.ok) return setResult(sent);
    const until = (sent.data as { grant: { expiresAt: string } }).grant.expiresAt;
    setResult({ ok: true, message: `Acesso de leitura aberto até ${TIME.format(new Date(until))}. Já dá para usar em Consultas; outra pessoa revisa depois.` });
    setText('');
    router.refresh();
  }

  return (
    <form className="panel form break-glass" onSubmit={submit}>
      <label className="field">
        Recurso
        <select name="resourceId" required>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Duração em minutos (de 5 a 15)
        <input name="minutes" type="number" min={5} max={15} defaultValue={10} required />
      </label>
      <label className="field">
        O que está acontecendo (40 caracteres ou mais, vai para a auditoria)
        <textarea value={text} onChange={(e) => setText(e.target.value)} minLength={40} maxLength={500} rows={3} required />
        <small className="note">{text.trim().length} de 40</small>
      </label>
      <button type="submit" className="button button-danger" disabled={busy}>
        {busy ? 'Abrindo…' : 'Abrir acesso de emergência'}
      </button>
      {result && (
        <p className={result.ok ? 'notice' : 'alert'} role={result.ok ? 'status' : 'alert'}>
          {result.message}
        </p>
      )}
    </form>
  );
}
