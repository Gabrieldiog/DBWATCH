import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { categoryOf, groupByCategory, loadReport, mergeReports, tallyByFile, type VitestReport } from '../src/lib/test-report';

const report: VitestReport = {
  numTotalTests: 3,
  numPassedTests: 2,
  numFailedTests: 1,
  startTime: 0,
  testResults: [
    {
      name: '/x/apps/api/test/db/audit.spec.ts',
      assertionResults: [
        { ancestorTitles: ['auditoria', 'cadeia'], title: 'detecta adulteração', status: 'passed', duration: 12.6 },
        { ancestorTitles: ['auditoria'], title: 'falhou de propósito', status: 'failed', duration: 0.2 },
      ],
    },
    { name: '/x/apps/api/test/env.unit.spec.ts', assertionResults: [{ ancestorTitles: [], title: 'env', status: 'passed' }] },
  ],
};

describe('categoryOf (unitário)', () => {
  it('classifica pelo caminho do arquivo', () => {
    expect(categoryOf('api/test/audit/failure.unit.spec.ts')).toBe('unit');
    expect(categoryOf('api/test/db/iam.spec.ts')).toBe('db');
    expect(categoryOf('api/test/health.spec.ts')).toBe('int');
  });
});

describe('groupByCategory (unitário)', () => {
  it('agrupa, marca falhas e arredonda durações', () => {
    const groups = groupByCategory(report);
    expect(groups.db.map((t) => [t.title, t.passed, t.durationMs])).toEqual([
      ['detecta adulteração', true, 13],
      ['falhou de propósito', false, 1],
    ]);
    expect(groups.db[0]).toMatchObject({ group: 'auditoria › cadeia', file: 'api/test/db/audit.spec.ts' });
    expect(groups.unit).toHaveLength(1);
    expect(groups.int).toHaveLength(0);
  });
});

describe('loadReport (unitário)', () => {
  it('devolve null para arquivo ausente ou inválido e o relatório quando válido', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dbwatch-report-'));
    const [valid, broken] = [path.join(dir, 'ok.json'), path.join(dir, 'ruim.json')];
    await writeFile(valid, JSON.stringify(report));
    await writeFile(broken, '{ nao e json');
    expect(await loadReport(path.join(dir, 'nao-existe.json'))).toBeNull();
    expect(await loadReport(broken)).toBeNull();
    expect((await loadReport(valid))?.numTotalTests).toBe(3);
  });
});

describe('mergeReports (unitário)', () => {
  it('soma os totais de API e web e não inventa relatório vazio', () => {
    const merged = mergeReports([report, { ...report, startTime: 5 }]);
    expect(merged).toMatchObject({ numTotalTests: 6, numFailedTests: 2, startTime: 5 });
    expect(merged?.testResults).toHaveLength(4);
    expect(mergeReports([])).toBeNull();
  });
});

describe('tallyByFile (unitário)', () => {
  it('conta testes aprovados e totais por arquivo', () => {
    expect(tallyByFile(report)).toEqual({
      'api/test/db/audit.spec.ts': { passed: 1, total: 2 },
      'api/test/env.unit.spec.ts': { passed: 1, total: 1 },
    });
  });
});
