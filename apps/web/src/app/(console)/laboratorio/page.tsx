import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import { Badge } from '../../../components/badge';
import { LabRunner } from '../../../components/lab-runner';
import { OUTCOME, type RunRow, type Scenario } from '../../../lib/lab';
import { when } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Laboratório' };

export default async function Laboratorio() {
  await requirePermission('lab:run');
  const scenarios = await apiGet<Scenario[] | null>('/lab/scenarios', true);
  if (!scenarios)
    return (
      <main className="console-page">
        <h1>Laboratório</h1>
        <p className="notice">
          O laboratório está desligado neste ambiente. Ele só liga com <code>LAB_ENABLED=true</code> e uma conexão própria
          para os experimentos.
        </p>
      </main>
    );
  const runs = await apiGet<RunRow[]>('/lab/runs');

  return (
    <main className="console-page">
      <h1>Laboratório</h1>
      <p>
        Experimentos provocados de propósito, com duas conexões reais (sessões A e B) e o papel <code>dbwatch_lab</code>,
        que só enxerga o schema <code>lab</code>. Os dados são fictícios e voltam ao ponto inicial antes de cada execução.
        Um experimento por vez no banco inteiro.
      </p>
      <Explica>
        <p>Cada experimento abre duas conexões reais (sessões A e B) num schema separado, <code>lab</code>, e faz as duas disputarem as mesmas linhas. A linha do tempo mostra cada comando com o tempo e o erro que o banco devolveu.</p>
        <p>Serve para provar ao vivo o que a disciplina ensina: atomicidade (rollback), espera de lock, deadlock (<code>40P01</code>), níveis de isolamento e índices. Tudo rotulado LAB, porque é provocado de propósito.</p>
      </Explica>
      <ul className="cards">
        {scenarios.map((s) => (
          <LabRunner key={s.name} scenario={s} />
        ))}
      </ul>
      <h2>Últimas execuções</h2>
      {runs.length === 0 ? (
        <p className="panel">Nenhuma execução ainda. Cada experimento rodado aqui fica registrado no banco e na auditoria.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Execução</th>
                <th scope="col">Cenário</th>
                <th scope="col">Quando</th>
                <th scope="col">Resultado</th>
                <th scope="col">Passos</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td data-label="Execução">#{r.id}</td>
                  <td data-label="Cenário">{r.scenario}</td>
                  <td data-label="Quando">{when(r.startedAt)}</td>
                  <td data-label="Resultado">
                    <Badge entry={OUTCOME[r.outcome]} fallback={r.outcome} />
                  </td>
                  <td data-label="Passos">{r.steps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
