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
    setState({ busy: true, ok: true, message: 'Rodando no banco por uns 35 s. Acompanhe o grafo de bloqueio e os eventos abaixo.' });
    setTimeout(() => setState({ busy: false }), 35_000);
  }

  return (
    <section className="panel simulation" aria-labelledby="sim-titulo">
      <span className="badge badge-wait">LAB</span>
      <h2 id="sim-titulo">Simulação de incidente: fechamento do mês</h2>
      <p>
        Quatro sessões reais no schema <code>lab</code>: um relatório esquece uma transação aberta e trava o caixa, o banco
        cancela a espera, derruba a transação esquecida e, no fim, resolve um deadlock entre duas transferências.
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
