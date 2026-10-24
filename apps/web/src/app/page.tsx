import Link from 'next/link';
import { Ronda } from '../components/ronda';
import { loadProjectReport, tallyByFile } from '../lib/test-report';

export const dynamic = 'force-dynamic';

const GUARANTEES = [
  {
    id: 'IAM-01',
    file: 'api/test/db/iam.spec.ts',
    title: 'Cada papel do banco só faz o que precisa',
    detail: 'A API não apaga usuários nem altera permissões, e ninguém atribui um papel a si mesmo.',
  },
  {
    id: 'AUD-02',
    file: 'api/test/db/audit.spec.ts',
    title: 'A auditoria não aceita alteração nem exclusão',
    detail: 'Nem o dono da tabela consegue. Adulteração feita por superusuário é apontada pela cadeia de hash.',
  },
  {
    id: 'TRX-03',
    file: 'api/test/audit/audited-transaction.spec.ts',
    title: 'Falhas continuam registradas depois do ROLLBACK',
    detail: 'O sucesso é gravado junto com a ação; a falha, numa transação separada.',
  },
  {
    id: 'ERR-04',
    file: 'api/test/health.spec.ts',
    title: 'Erros não expõem detalhes internos',
    detail: 'A resposta traz só um código de suporte, nunca stack trace ou SQL.',
  },
];

export default async function Home() {
  const report = await loadProjectReport();
  const tally = report ? tallyByFile(report) : {};

  return (
    <main className="page">
      <h1>Visão geral</h1>
      <p className="lede">
        O DBWATCH controla quem acessa os bancos de dados e registra cada ação numa auditoria que não pode ser alterada
        sem que alguém perceba.
      </p>

      <Ronda />

      <section className="section" aria-labelledby="garantias">
        <h2 id="garantias">O que já está garantido</h2>
        <p className="hint">
          Cada item é verificado por testes automatizados contra um PostgreSQL real.{' '}
          {report ? <Link href="/testes">Ver todos os testes</Link> : 'Rode pnpm test:report para ver a evidência.'}
        </p>
        <ul className="ledger">
          {GUARANTEES.map((g) => {
            const t = tally[g.file];
            return (
              <li key={g.id}>
                <span className="id mono">{g.id}</span>
                <span>
                  <span className="title">{g.title}</span>
                  <span className="detail">{g.detail}</span>
                </span>
                <span className="end">
                  {t ? (
                    <>
                      {/* Um segmento por teste real: cheio só se o teste passou */}
                      <span className="segments" aria-hidden>
                        {Array.from({ length: t.total }, (_, i) => (
                          <i key={i} data-ok={i < t.passed ? '' : undefined} />
                        ))}
                      </span>
                      <span className="mono">
                        {t.passed} de {t.total} testes
                      </span>
                    </>
                  ) : (
                    'sem relatório'
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
