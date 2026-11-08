import type { Metadata } from 'next';
import Link from 'next/link';
import { QueryCard, type Template } from '../../../components/query-card';
import { liveAccess, when, type Grant } from '../../../lib/pam';
import { apiGet, requirePermission } from '../../../lib/session';

export const metadata: Metadata = { title: 'Consultas' };

export default async function Consultas() {
  await requirePermission('query:execute');
  const [catalog, grants] = await Promise.all([apiGet<Template[]>('/queries'), apiGet<Grant[]>('/grants/mine')]);
  return (
    <main className="console-page">
      <h1>Consultas</h1>
      <p>
        Aqui se leem os dados da loja fictícia, mas só com um acesso aprovado e ainda vivo para o recurso da consulta.
        Nem o administrador vê dados sem isso: quem administra o sistema não é dono dos dados.
      </p>
      <ol className="flow flow-compact" aria-label="Como consultar">
        <li>
          <strong>Peça acesso</strong>
          <span>Ao recurso da consulta, com justificativa.</span>
        </li>
        <li>
          <strong>Outra pessoa aprova</strong>
          <span>Recurso de sensibilidade alta precisa de duas.</span>
        </li>
        <li>
          <strong>Consulte enquanto valer</strong>
          <span>Só leitura, com tempo-limite e registro na auditoria.</span>
        </li>
      </ol>
      <p className="note">
        Por que não tem um campo de SQL livre? Quem aprova precisa saber exatamente o que vai poder ser feito. Aqui você só
        escolhe um valor; o comando é sempre o do catálogo, e o valor vai separado do SQL ($1).
      </p>
      {/* Um bloco por recurso, com o acesso dito uma vez; a consulta do LAB vai por último */}
      {[...new Map(catalog.map((q) => [q.resource.id, q.resource])).values()].map((r) => {
        const access = liveAccess(grants, r.id);
        const queries = catalog.filter((q) => q.resource.id === r.id).sort((a, b) => Number(a.title.startsWith('LAB')) - Number(b.title.startsWith('LAB')));
        return (
          <section key={r.id} aria-labelledby={`recurso-${r.id}`}>
            <h2 id={`recurso-${r.id}`}>{r.name}</h2>
            {access ? (
              <p className="access access-ok">Você tem acesso a {r.name} até {when(access.expiresAt)}.</p>
            ) : (
              <p className="access">
                Sem acesso a {r.name} agora. <Link href={`/pedidos?recurso=${r.id}`}>Pedir acesso a {r.name}</Link>
              </p>
            )}
            <ul className="cards">
              {queries.map((q) => (
                <QueryCard key={q.code} q={q} />
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
