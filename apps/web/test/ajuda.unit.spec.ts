import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIA, PERMISSAO } from '../src/lib/ajuda';
import { NAV } from '../src/lib/console';

// As permissões vêm das próprias migrations: uma permissão nova sem frase em português quebra este teste
const migrations = join(__dirname, '../../api/prisma/migrations');
const fromDb = readdirSync(migrations).flatMap((dir) => {
  const sql = readFileSync(join(migrations, dir, 'migration.sql'), 'utf8');
  const inserts = sql.match(/INSERT INTO "iam"\."permissions"[^;]*;/g) ?? [];
  return inserts.flatMap((i) => [...i.matchAll(/\('([a-z]+:[a-z:]+)'/g)].map((m) => m[1]!));
});

describe('textos de ajuda (unitário)', () => {
  it('cada permissão do banco tem uma frase, e nenhuma frase sobra', () => {
    expect(fromDb.length).toBeGreaterThan(10);
    expect(Object.keys(PERMISSAO).sort()).toEqual([...new Set(fromDb)].sort());
  });

  it('cada área do menu, menos a própria visão geral, tem o que é e para que serve', () => {
    expect(NAV.filter((i) => i.href !== '/painel').map((i) => i.href).sort()).toEqual(Object.keys(GUIA).sort());
  });
});
