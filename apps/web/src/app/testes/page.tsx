import type { Metadata } from 'next';
import { CATEGORIES, groupByCategory, loadProjectReport } from '../../lib/test-report';

export const metadata: Metadata = { title: 'Testes' };
export const dynamic = 'force-dynamic';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

const sentenceCase = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

export default async function TestsPage() {
  const report = await loadProjectReport();

  if (!report) {
    return (
      <main className="page">
        <h1>Testes automatizados</h1>
        <p className="lede">
          Nenhum relatório encontrado. Rode <code>pnpm test:report</code> na raiz do projeto e recarregue a página.
        </p>
      </main>
    );
  }

  const groups = groupByCategory(report);
  const failed = report.numFailedTests;

  return (
    <main className="page">
      <h1>Testes automatizados</h1>
      <p className="lede">
        Resultado real da última execução de <code>pnpm test:report</code>, em{' '}
        <span className="mono">{dateTime.format(new Date(report.startTime))}</span>.
      </p>
      <p role="status" className={`summary ${failed === 0 ? 'mark-ok' : 'mark-fail'}`}>
        {failed === 0 ? '✓' : '✕'} {report.numPassedTests} de {report.numTotalTests} testes passaram
        {failed > 0 && `, ${failed} ${failed === 1 ? 'falhou' : 'falharam'}`}
      </p>

      {CATEGORIES.map((category) => {
        const tests = groups[category.key];
        if (tests.length === 0) return null;
        return (
          <section key={category.key} className="section" aria-labelledby={`cat-${category.key}`}>
            <h2 id={`cat-${category.key}`}>
              {category.title} <span className="mono hint">{tests.length}</span>
            </h2>
            <p className="hint">{category.hint}</p>
            <ul className="ledger tests">
              {tests.map((t) => (
                <li key={`${t.file}-${t.group}-${t.title}`}>
                  <span aria-hidden className={t.passed ? 'mark-ok' : 'mark-fail'}>
                    {t.passed ? '✓' : '✕'}
                  </span>
                  <span>
                    <span className="title">{sentenceCase(t.title)}</span>
                    <span className="detail">
                      {t.group}, em <code>{t.file}</code>
                    </span>
                  </span>
                  <span className="end mono">
                    <span className="sr-only">{t.passed ? 'passou em' : 'falhou em'} </span>
                    {t.durationMs} ms
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
