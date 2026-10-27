import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

// Cria e popula o banco-alvo de demonstração com o dono do banco (migrator); o SQL é idempotente
export async function applyTargetSchema(migratorUrl: string): Promise<void> {
  const url = new URL(migratorUrl);
  url.pathname = '/dbwatch_target';
  const client = new Client(url.toString());
  await client.connect();
  try {
    await client.query(readFileSync(resolve(process.cwd(), '../../infra/target/schema.sql'), 'utf8'));
  } finally {
    await client.end();
  }
}
