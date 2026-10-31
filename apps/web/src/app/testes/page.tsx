import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { CATEGORIES, groupByCategory, loadReport, mergeReports, type VitestReport } from '../../lib/test-report';

export const metadata: Metadata = { title: 'Testes · DBWATCH' };
export const dynamic = 'force-dynamic';

// Texto só para leitores de tela: o status não depende apenas da cor do ícone
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

const color = { border: 'var(--border)', muted: 'var(--text-muted)', ok: 'var(--signal)', fail: 'var(--coral)' };

export default async function TestsPage() {
  // Caminhos literais: o empacotador sabe exatamente o que ler e não arrasta o projeto inteiro
  const loaded = await Promise.all([loadReport('../../reports/tests/api.json'), loadReport('../../reports/tests/web.json')]);
  const report = mergeReports(loaded.filter((r): r is VitestReport => r !== null));
  const page: CSSProperties = { maxWidth: 960, margin: '0 auto', padding: '48px 24px', lineHeight: 1.6 };

  if (!report) {
    return (
      <main style={page}>
        <h1>Testes automatizados</h1>
        <p style={{ color: color.muted }}>
          Nenhum relatório encontrado. Rode <code>pnpm test:report</code> na raiz do projeto e recarregue a página.
        </p>
      </main>
    );
  }

  const groups = groupByCategory(report);
  const generatedAt = new Date(report.startTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const allPassed = report.numFailedTests === 0;

  return (
    <main style={page}>
      <h1 style={{ marginBottom: 4 }}>Testes automatizados</h1>
      <p style={{ color: color.muted, marginTop: 0 }}>
        Resultado real da última execução de <code>pnpm test:report</code>, em {generatedAt}.
      </p>
      <p role="status" style={{ fontSize: 20, color: allPassed ? color.ok : color.fail }}>
        {allPassed ? '●' : '✕'} {report.numPassedTests} de {report.numTotalTests} testes passaram
        {allPassed ? '' : ` · ${report.numFailedTests} ${report.numFailedTests === 1 ? 'falhou' : 'falharam'}`}
      </p>

      {CATEGORIES.map((category) => {
        const tests = groups[category.key];
        if (tests.length === 0) return null;
        return (
          <section key={category.key} style={{ marginTop: 40 }}>
            <h2 style={{ marginBottom: 0 }}>
              {category.title} <span style={{ color: color.muted, fontWeight: 400 }}>({tests.length})</span>
            </h2>
            <p style={{ color: color.muted, marginTop: 0 }}>{category.hint}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: `1px solid ${color.border}`, borderRadius: 12 }}>
              {tests.map((t, i) => {
                const passed = t.passed;
                return (
                  <li
                    key={`${t.file}-${t.group}-${t.title}`}
                    style={{ display: 'flex', gap: 12, padding: '10px 16px', borderTop: i ? `1px solid ${color.border}` : 'none' }}
                  >
                    <span aria-hidden style={{ color: passed ? color.ok : color.fail }}>{passed ? '✓' : '✕'}</span>
                    <span style={{ flex: 1 }}>
                      {t.title}
                      <br />
                      <small style={{ color: color.muted }}>
                        {t.group} · <code>{t.file}</code>
                      </small>
                    </span>
                    <span style={{ color: color.muted, whiteSpace: 'nowrap' }}>
                      <span style={srOnly}>{passed ? 'passou' : 'falhou'} em </span>
                      {t.durationMs} ms
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
