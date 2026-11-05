import type { Metadata } from 'next';
import { Entrada } from '../../components/entrada';

export const metadata: Metadata = { title: 'Entrar' };

// Mesma página da raiz: os redirecionamentos de sessão (next, motivo) continuam chegando aqui
export default function LoginPage() {
  return <Entrada />;
}
