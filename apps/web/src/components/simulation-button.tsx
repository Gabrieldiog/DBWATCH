'use client';

import { useState } from 'react';
import { send } from '../lib/send';

type Step = { terminou?: boolean; parado?: boolean; segundos?: number };
// waiting: o passo a passo está em andamento e o botão principal vira Próximo passo
type State = { busy: boolean; waiting?: boolean; message?: string; ok?: boolean };

// O botão só dispara: a história acontece no PostgreSQL e chega a esta tela pelo grafo, pelos números e pelo SSE
export function SimulationButton() {
  const [state, setState] = useState<State>({ busy: false });

  async function start() {
    setState({ busy: true });
    const sent = await send('/lab/simulacao');
    if (!sent.ok) return setState({ busy: false, ok: false, message: sent.message });
    const seconds = (sent.data as Step | null)?.segundos ?? 55;
    setState({ busy: true, ok: true, message: `Rodando no banco por uns ${seconds} s. Acompanhe os eventos e o grafo de bloqueio abaixo.` });
    setTimeout(() => setState({ busy: false }), seconds * 1000);
  }

  // Passo a passo: o bot faz uma ação no banco e para; a API responde quando ele parou (ou em 20 s, e aí pergunta de novo)
  async function step(path: string) {
    setState({ busy: true, waiting: path.endsWith('proximo'), ok: true, message: 'O bot está agindo no banco…' });
    for (;;) {
      const sent = await send(path);
      if (!sent.ok) return setState({ busy: false, ok: false, message: sent.message });
      const data = sent.data as Step;
      if (data.terminou) return setState({ busy: false, ok: true, message: 'Simulação concluída. Tudo está na auditoria, marcado como simulação.' });
      if (data.parado) return setState({ busy: false, waiting: true, ok: true, message: 'Parado. Explique o que apareceu nos eventos e clique em Próximo passo.' });
      path = '/lab/simulacao/proximo';
    }
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
      <p>No passo a passo o bot faz uma ação e espera você explicar antes de seguir.</p>
      <div className="row">
        {state.waiting ? (
          <button type="button" className="button" onClick={() => step('/lab/simulacao/proximo')} disabled={state.busy}>
            {state.busy ? 'Agindo no banco…' : 'Próximo passo'}
          </button>
        ) : (
          <>
            <button type="button" className="button" onClick={start} disabled={state.busy}>
              {state.busy ? 'Simulação em andamento…' : '▶ Iniciar simulação'}
            </button>
            <button type="button" className="button button-quiet" onClick={() => step('/lab/simulacao?modo=passo')} disabled={state.busy}>
              Passo a passo
            </button>
          </>
        )}
      </div>
      {state.message && (
        <p className={state.ok ? 'notice' : 'alert'} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      )}
    </section>
  );
}
