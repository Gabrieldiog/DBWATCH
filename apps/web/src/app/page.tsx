import Image from 'next/image';
import Link from 'next/link';
import { ThemeToggle } from '../components/theme-toggle';

type Health = { status: string; database: { status: 'up' | 'down'; latencyMs?: number } };

async function fetchHealth(): Promise<Health | null> {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
  try {
    const res = await fetch(`${apiUrl}/api/health`, { cache: 'no-store' });
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await fetchHealth();
  const up = health?.database.status === 'up';
  const label = !health
    ? 'API indisponível'
    : up
      ? `PostgreSQL no ar · ${health.database.latencyMs} ms`
      : 'PostgreSQL fora do ar';

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', textAlign: 'center' }}>
      <div>
        <Image src="/dbwatch-icon.png" alt="Logo do DBWATCH" width={128} height={128} priority />
        <h1>DBWATCH</h1>
        <p role="status" style={{ color: up ? 'var(--signal)' : 'var(--coral)' }}>
          {up ? '●' : '✕'} {label}
        </p>
        <Link href="/testes" style={{ color: 'var(--scan)' }}>
          Ver os testes automatizados
        </Link>
        <div style={{ marginTop: 24 }}>
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
