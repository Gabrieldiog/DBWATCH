import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { LoginForm } from '../../components/login-form';
import { ThemeToggle } from '../../components/theme-toggle';

export const metadata: Metadata = { title: 'Entrar' };

const RINGS = [96, 72, 48, 24];

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-radar" aria-hidden>
        <svg viewBox="-100 -100 200 200">
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--scan)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--scan)" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {RINGS.map((r) => (
            <circle key={r} r={r} fill="none" stroke="var(--border)" strokeWidth="0.6" />
          ))}
          <path d="M-96 0H96M0 -96V96" stroke="var(--border)" strokeWidth="0.6" />
          <path className="sweep" d="M0 0L96 0A96 96 0 0 0 67.9 -67.9Z" fill="url(#sweep)" />
        </svg>
        <Image src="/dbwatch-icon.png" alt="" width={240} height={240} priority />
      </div>
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title">Entrar no DBWATCH</h1>
        <p>Use o e-mail e a senha da sua conta. Cada acesso fica registrado na auditoria.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
        <ThemeToggle />
      </section>
    </main>
  );
}
