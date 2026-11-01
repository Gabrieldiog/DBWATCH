import { execFileSync } from 'node:child_process';

// Mesmo efeito do pnpm db:seed: senhas demo novas e sessões antigas revogadas.
// As senhas vão para os testes por variável de ambiente, nunca para arquivo
export default function globalSetup(): void {
  const out = execFileSync('pnpm', ['--silent', '--filter', '@dbwatch/api', 'db:seed:json'], { encoding: 'utf8' });
  process.env.E2E_USERS = out.trim().split('\n').pop();
}
