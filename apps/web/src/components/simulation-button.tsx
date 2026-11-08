'use client';

import { useState } from 'react';
import { send } from '../lib/send';

// O botão só dispara: a história acontece no PostgreSQL e chega a esta tela pelo grafo, pelos números e pelo SSE
export function SimulationButton() {
  const [state, setState] = useState<{ busy: boolean; message?: string; ok?: boolean }>({ busy: false });

  async function start() {
    setState({ busy: true });
    const sent = await send('/lab/simulacao');
    if (!sent.ok) return setState({ busy: false, ok: false, message: sent.message });
    const seconds = (sent.data as { segundos?: number } | null)?.segundos ?? 55;
    setState({ busy: true, ok: true, message: `Rodando no banco por uns ${seconds} s. Acompanhe os eventos e o grafo de bloqueio abaixo.` });
    setTimeout(() => setState({ busy: false }), seconds * 1000);
  }

  return (
    <section className="panel simulation" aria-labelledby="sim-titulo">
      <span className="badge badge-wait">LAB</span>
      <h2 id="sim-titulo">Simulação: um dia no DBWATCH</h2>
      <p>
        Um bot faz o sistema funcionar sozinho, de verdade. Ato 1: Diego pede acesso, tenta aprovar o próprio pedido
        (a API e o banco barram), Bruno aprova e Diego consulta. Ato 2: um relatório esquecido trava o caixa no schema{' '}
        <code>lab</code> e o banco resolve o bloqueio e um deadlock. Ato 3: Eva verifica a trilha de auditoria.
      </p>
      <button type="button" className="button" onClick={start} disabled={state.busy}>
        {state.busy ? 'Simulação em andamento…' : '▶ Iniciar simulação'}
      </button>
      {state.message && (
        <p className={state.ok ? 'notice' : 'alert'} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      )}
    </section>
  );
}
