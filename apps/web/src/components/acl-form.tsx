'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { WEEKDAYS } from '../lib/console';
import { send } from '../lib/send';

// Campo vazio = "qualquer". O banco confere a faixa (sem bits de host), a janela e recusa regra que negue todo mundo sempre
export function AclForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim() || undefined;
    const days = data.getAll('weekdays').map(Number);
    setBusy(true);
    const sent = await send('/login-acl', {
      priority: Number(data.get('priority')),
      action: data.get('action'),
      ipRange: text('ipRange'),
      weekdays: days.length ? days : undefined,
      startTime: text('startTime'),
      endTime: text('endTime'),
      description: text('description') ?? '',
    });
    setBusy(false);
    setResult(sent.ok ? { ok: true, message: 'Regra criada. Ela já vale para o próximo login.' } : sent);
    if (!sent.ok) return;
    form.reset();
    router.refresh();
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <div className="row">
        <label className="field">
          Prioridade (menor vence)
          <input name="priority" type="number" min={1} max={1000} defaultValue={100} required />
        </label>
        <label className="field">
          Ação
          <select name="action">
            <option value="DENY">Negar</option>
            <option value="ALLOW">Permitir</option>
          </select>
        </label>
        <label className="field">
          Faixa de IP (vazio = qualquer)
          <input name="ipRange" placeholder="10.0.0.0/8" maxLength={43} />
        </label>
      </div>
      <fieldset className="field">
        <legend>Dias (nenhum marcado = todos)</legend>
        <div className="row">
          {WEEKDAYS.map((d, i) => (
            <label key={d}>
              <input type="checkbox" name="weekdays" value={i + 1} /> {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row">
        <label className="field">
          Das (horário de Brasília)
          <input name="startTime" type="time" />
        </label>
        <label className="field">
          Até
          <input name="endTime" type="time" />
        </label>
      </div>
      <label className="field">
        Descrição
        <input name="description" maxLength={200} required placeholder="Negar login fora da rede da faculdade à noite" />
      </label>
      <button type="submit" className="button" disabled={busy}>
        {busy ? 'Criando…' : 'Criar regra'}
      </button>
      {result && (
        <p className={result.ok ? 'notice' : 'alert'} role={result.ok ? 'status' : 'alert'}>
          {result.message}
        </p>
      )}
    </form>
  );
}
