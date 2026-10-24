import { readFile } from 'node:fs/promises';

type Assertion = { ancestorTitles: string[]; title: string; status: string; duration?: number };
type FileResult = { name: string; assertionResults: Assertion[] };
export type VitestReport = {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  startTime: number;
  testResults: FileResult[];
};

export const CATEGORIES = [
  { key: 'unit', title: 'Unitários', hint: 'Regras puras, sem banco de dados' },
  { key: 'db', title: 'Banco de dados', hint: 'Constraints, privilégios por papel e auditoria no PostgreSQL 16 real' },
  { key: 'int', title: 'Integração', hint: 'API, Prisma e transações contra o PostgreSQL 16 real' },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]['key'];

export type TestRow = { file: string; group: string; title: string; passed: boolean; durationMs: number };

// Convenção: *.unit.spec.ts não toca no banco; test/db/ testa o banco direto; o resto é integração
export function categoryOf(file: string): CategoryKey {
  if (file.endsWith('.unit.spec.ts')) return 'unit';
  return file.includes('test/db/') ? 'db' : 'int';
}

export function groupByCategory(report: VitestReport): Record<CategoryKey, TestRow[]> {
  const groups: Record<CategoryKey, TestRow[]> = { unit: [], db: [], int: [] };
  for (const result of report.testResults) {
    const file = result.name.split('/apps/')[1] ?? result.name;
    for (const a of result.assertionResults) {
      groups[categoryOf(file)].push({
        file,
        group: a.ancestorTitles.join(' › '),
        title: a.title,
        passed: a.status === 'passed',
        durationMs: Math.max(1, Math.round(a.duration ?? 0)),
      });
    }
  }
  return groups;
}

export async function loadReport(file: string): Promise<VitestReport | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as VitestReport;
    return Array.isArray(parsed.testResults) ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeReports(reports: VitestReport[]): VitestReport | null {
  if (reports.length === 0) return null;
  return {
    numTotalTests: reports.reduce((sum, r) => sum + r.numTotalTests, 0),
    numPassedTests: reports.reduce((sum, r) => sum + r.numPassedTests, 0),
    numFailedTests: reports.reduce((sum, r) => sum + r.numFailedTests, 0),
    startTime: Math.max(...reports.map((r) => r.startTime)),
    testResults: reports.flatMap((r) => r.testResults),
  };
}
