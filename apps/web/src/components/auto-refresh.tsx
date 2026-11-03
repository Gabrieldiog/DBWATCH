'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Relê a tela no servidor no ritmo da coleta; com a aba escondida não gasta consulta à toa
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => document.hidden || router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
