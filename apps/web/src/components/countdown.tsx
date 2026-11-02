'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clock } from '../lib/pam';

// Parte dos segundos que o banco calculou; o navegador só mede quanto tempo passou desde então,
// então um relógio errado no computador da pessoa não muda o prazo. No zero, o servidor redesenha a tela
export function Countdown({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const end = performance.now() + seconds * 1000;
    const id = setInterval(() => {
      const now = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      setLeft(now);
      if (now > 0) return;
      clearInterval(id);
      router.refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [seconds, router]);

  return (
    <span role="timer" className={left <= 300 ? 'countdown countdown-soon' : 'countdown'}>
      {clock(left)}
    </span>
  );
}
