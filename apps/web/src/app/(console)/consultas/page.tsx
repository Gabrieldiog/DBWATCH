import type { Metadata } from 'next';
import { QueryCard, type Template } from '../../../components/query-card';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Consultas' };

export default async function Consultas() {
  await requirePermission('query:execute');
  const catalog = await apiGet<Template[]>('/queries');
  return (
    <main className="console-page">
      <h1>Consultas</h1>
      <p>
        Só consultas do catálogo, somente leitura e com tempo-limite. Cada execução confere a sua concessão no banco e fica
        registrada na auditoria com o código mostrado abaixo do resultado.
      </p>
      <ul className="cards">
        {catalog.map((q) => (
          <QueryCard key={q.code} q={q} />
        ))}
      </ul>
    </main>
  );
}
