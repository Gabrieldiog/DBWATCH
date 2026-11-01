import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="console-page">
      <h1>Página não encontrada</h1>
      <p>O endereço não existe ou esta tela ainda não foi publicada.</p>
      <p>
        <Link href="/painel">Voltar para a visão geral</Link>
      </p>
    </main>
  );
}
