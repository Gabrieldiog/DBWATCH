import type { Metadata } from 'next';
import { Explica } from '../../../components/explica';
import { Badge } from '../../../components/badge';
import { LabRunner } from '../../../components/lab-runner';
import { NOME, OUTCOME, type RunRow, type Scenario } from '../../../lib/lab';
import { when } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Laboratório' };
const RECENT = 8;

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
        Seis experimentos de verdade no PostgreSQL, com duas conexões (sessões A e B) disputando as mesmas linhas num
        schema separado, com dados fictícios. Um por vez no banco inteiro.
      </p>
      <Explica>
        <p>Cada um prova um conceito: rollback, espera de lock, deadlock (<code>40P01</code>), isolamento e índices. A linha do tempo mostra cada comando, o tempo e o erro que o banco devolveu.</p>
      </Explica>
      <ul className="cards cards-grid">
        {scenarios.map((s) => (
          <LabRunner key={s.name} scenario={s} />
        ))}
      </ul>
      <h2>Últimas execuções</h2>
      {runs.length > RECENT && <p className="note">As {RECENT} mais recentes. Todas ficam registradas na auditoria.</p>}
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
              {runs.slice(0, RECENT).map((r) => (
                <tr key={r.id}>
                  <td data-label="Execução">#{r.id}</td>
                  <td data-label="Cenário">{NOME[r.scenario] ?? r.scenario}</td>
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
