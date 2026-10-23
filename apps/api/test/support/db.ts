import { Client } from 'pg';

export type DbRole =
  | 'admin'
  | 'dbwatch_migrator'
  | 'dbwatch_app'
  | 'dbwatch_monitor'
  | 'dbwatch_lab'
  | 'dbwatch_target_ro';

const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) throw new Error('Defina TEST_DATABASE_URL (veja .env.example)');

const passwordVar: Record<Exclude<DbRole, 'admin'>, string> = {
  dbwatch_migrator: 'DBWATCH_MIGRATOR_PASSWORD',
  dbwatch_app: 'DBWATCH_APP_PASSWORD',
  dbwatch_monitor: 'DBWATCH_MONITOR_PASSWORD',
  dbwatch_lab: 'DBWATCH_LAB_PASSWORD',
  dbwatch_target_ro: 'DBWATCH_TARGET_RO_PASSWORD',
};

export function urlFor(role: DbRole, database?: string): string {
  const url = new URL(adminUrl as string);
  if (role !== 'admin') {
    const password = process.env[passwordVar[role]];
    if (!password) throw new Error(`Defina ${passwordVar[role]}`);
    url.username = role;
    url.password = password;
  }
  if (database) url.pathname = `/${database}`;
  return url.toString();
}

export async function withClient<T>(
  role: DbRole,
  fn: (client: Client) => Promise<T>,
  database?: string,
): Promise<T> {
  const client = new Client(urlFor(role, database));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Devolve o SQLSTATE do erro, ou undefined se a operação passou
export async function sqlState(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code ?? 'sem-codigo';
  }
}
