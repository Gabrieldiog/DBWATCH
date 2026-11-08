import { execFileSync } from 'node:child_process';

// Mesmo efeito do pnpm db:seed: senhas demo novas e sessões antigas revogadas.
// As senhas vão para os testes por variável de ambiente, nunca para arquivo
export default function globalSetup(): void {
  // O bot contra a VPS recebe as senhas do seed de lá (pnpm db:seed:json); aqui não roda seed nenhum
  if (process.env.DBWATCH_URL) {
    if (!process.env.E2E_USERS) throw new Error('Defina E2E_USERS com a saída do pnpm db:seed:json do servidor');
    return;
  }
  const out = execFileSync('pnpm', ['--silent', '--filter', '@dbwatch/api', 'db:seed:json'], { encoding: 'utf8' });
  process.env.E2E_USERS = out.trim().split('\n').pop();
}
