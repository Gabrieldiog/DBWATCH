import Image from 'next/image';
import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { ThemeToggle } from './theme-toggle';

type Health = { database: { status: 'up' | 'down'; latencyMs?: number } };

// Status real do banco, lido no servidor a cada visita: nunca um selo fixo de "online"
async function health(): Promise<string | null> {
  try {
    const res = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/api/health`, { cache: 'no-store' });
    const body = (await res.json()) as Health;
    return body.database.status === 'up' ? `PostgreSQL no ar, ${body.database.latencyMs} ms` : null;
  } catch {
    return null;
  }
}

const FLOW = [
  ['Pedir', 'Quem precisa escolhe o recurso, o tempo e explica o motivo.'],
  ['Aprovar', 'Outra pessoa decide. Recurso sensível precisa de duas.'],
  ['Usar', 'As consultas rodam só enquanto a concessão está viva.'],
  ['Expira sozinho', 'O relógio é o do banco. Ninguém precisa lembrar de tirar.'],
];

// Cada promessa da página aponta para a regra que a garante dentro do PostgreSQL
const RULES = [
  ['Ninguém aprova o próprio pedido', 'Mesmo com um erro na API, o banco recusa. A única exceção é o acesso de emergência, revisado depois.', 'CHECK (decided_by <> requester_id)'],
  ['Recurso sensível pede duas pessoas', 'A segunda aprovação precisa vir de alguém diferente da primeira.', 'CHECK (first_approved_by <> decided_by)'],
  ['Um acesso vivo por vez', 'Duas concessões da mesma pessoa no mesmo recurso não se sobrepõem no tempo.', 'EXCLUDE USING gist (… tstzrange …)'],
  ['Trilha que denuncia adulteração', 'Cada registro guarda o hash do anterior; alterar um quebra a cadeia daquele ponto em diante.', 'SELECT * FROM audit.verify_chain()'],
  ['Monitor com dados do próprio banco', 'Sessões, esperas e bloqueios lidos das views nativas, a cada 5 segundos.', 'pg_stat_activity, pg_locks, pg_blocking_pids()'],
  ['Concorrência provada ao vivo', 'Duas sessões reais disputam linhas: espera de lock, deadlock e write skew.', 'ERROR 40P01: deadlock detected'],
];

export async function Entrada() {
  const status = await health();
  return (
    <div className="entrada">
      <header className="entrada-top">
        <span className="brand">
          <Image src="/dbwatch-icon.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
          DBWATCH
        </span>
        <p className={status ? 'pulse pulse-up' : 'pulse'}>
          {status ?? 'PostgreSQL fora do ar: o login volta quando o banco voltar'}
        </p>
      </header>

      <main className="entrada-main">
        <section className="entrada-hero" aria-labelledby="entrada-titulo">
          <h1 id="entrada-titulo">Acesso privilegiado com o banco de dados como última linha de defesa</h1>
          <p className="entrada-lead">
            O DBWATCH controla quem acessa dados sensíveis, por quanto tempo e com a aprovação de quem. As regras
            que importam vivem dentro do PostgreSQL, então um erro na aplicação não basta para furá-las.
          </p>
        </section>

        <section className="entrada-flow" aria-label="Como um acesso acontece">
          <ol className="flow">
            {FLOW.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="login-panel entrada-login" aria-labelledby="login-title">
          <div className="login-radar" aria-hidden>
            <svg viewBox="-100 -100 200 200">
              <defs>
                <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--scan)" stopOpacity="0" />
                  <stop offset="1" stopColor="var(--scan)" stopOpacity="0.35" />
                </linearGradient>
              </defs>
              {[96, 72, 48, 24].map((r) => (
                <circle key={r} r={r} fill="none" stroke="var(--border)" strokeWidth="0.6" />
              ))}
              <path d="M-96 0H96M0 -96V96" stroke="var(--border)" strokeWidth="0.6" />
              <path className="sweep" d="M0 0L96 0A96 96 0 0 0 67.9 -67.9Z" fill="url(#sweep)" />
            </svg>
            <Image src="/dbwatch-icon.png" alt="" width={160} height={160} priority />
          </div>
          <h2 id="login-title">Entrar no DBWATCH</h2>
          <p>Use o e-mail e a senha da sua conta. Cada acesso fica registrado na auditoria.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </section>

        <section className="rules" aria-labelledby="regras-titulo">
          <h2 id="regras-titulo">O que o banco garante, mesmo se a aplicação errar</h2>
          <ul>
            {RULES.map(([title, text, sql]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
                <code>{sql}</code>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="entrada-foot">
        <p>Projeto de Software para Persistência de Dados, InovaTech 2026, UniGoiás. Os dados são fictícios.</p>
        <ThemeToggle />
      </footer>
    </div>
  );
}
