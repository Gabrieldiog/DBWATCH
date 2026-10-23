import { execFileSync } from 'node:child_process';
import { urlFor } from './support/db';

// Aplica as migrations no banco de testes com o papel migrator, igual ao deploy real
export default function setup(): void {
  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    env: { ...process.env, MIGRATOR_DATABASE_URL: urlFor('dbwatch_migrator') },
    stdio: 'pipe',
  });
}
