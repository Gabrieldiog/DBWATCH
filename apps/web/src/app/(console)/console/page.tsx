import type { Metadata } from 'next';
import Link from 'next/link';
import { ConsoleForm } from '../../../components/console-form';
import { Explica } from '../../../components/explica';
import { liveAccess, type Grant, type Resource } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Console SQL' };

const access = (g?: Grant) => g && { level: g.accessLevel === 'WRITE' ? ('WRITE' as const) : ('READ' as const), expiresAt: g.expiresAt };

export default async function Console() {
  await requirePermission('query:execute');
  const [resources, grants] = await Promise.all([apiGet<Resource[]>('/resources'), apiGet<Grant[]>('/grants/mine')]);
  return (
    <main className="console-page">
      <h1>Console SQL</h1>
      <p>
        Escreva SQL de verdade no banco da loja. Com acesso de Leitura você consulta; com Escrita, também altera. Prefere
        não digitar? Use as <Link href="/consultas">Consultas</Link>.
      </p>
      <Explica>
        <ul>
          <li><strong>Quem barra é o banco:</strong> cada recurso só alcança a tabela dele, e a Leitura roda em modo somente leitura.</li>
          <li><strong>Erro explicado:</strong> primeiro o que aconteceu, embaixo a resposta original do PostgreSQL.</li>
          <li><strong>Tudo registrado:</strong> o comando inteiro vai para a auditoria e aparece no Monitor.</li>
        </ul>
      </Explica>
      <ConsoleForm resources={resources.map((r) => ({ id: r.id, name: r.name, access: access(liveAccess(grants, r.id)) }))} />
    </main>
  );
}
