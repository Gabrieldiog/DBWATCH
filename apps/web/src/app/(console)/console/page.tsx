import type { Metadata } from 'next';
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
        Escreva SQL de verdade no banco da loja, com um acesso aprovado e vivo: com Leitura você consulta, com Escrita
        também altera. Prefere sem digitar? As Consultas têm as perguntas prontas. O comando inteiro vai para a auditoria e
        aparece ao vivo no Monitor.
      </p>
      <Explica>
        <ul>
          <li><strong>Leitura não escreve:</strong> com acesso de Leitura a transação nasce somente leitura (READ ONLY), e um UPDATE volta com o erro 25006 do próprio PostgreSQL.</li>
          <li><strong>Quem limita é o banco:</strong> cada recurso tem um papel no PostgreSQL que só altera a tabela dele (Clientes, produtos do Catálogo ou pedidos do Financeiro). Nada de criar, apagar ou esvaziar tabela.</li>
          <li><strong>Um comando por vez</strong>, com 3 s de tempo-limite. "UPDATE ...; DROP ..." é recusado pelo próprio banco.</li>
          <li><strong>Erros são do PostgreSQL:</strong> a mensagem que aparece é a que o banco devolveu, com o código (por exemplo, 42501 é permissão negada).</li>
          <li>Os botões de exemplo incluem tentativas que o banco recusa, para ver a regra funcionando.</li>
        </ul>
      </Explica>
      <ConsoleForm resources={resources.map((r) => ({ id: r.id, name: r.name, access: access(liveAccess(grants, r.id)) }))} />
    </main>
  );
}
