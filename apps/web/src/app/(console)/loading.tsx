// Enquanto o servidor busca os dados na API, o esqueleto tem a forma da tela (título, texto, cartões, tabela).
// O menu continua clicável: só o conteúdo espera
export default function Carregando() {
  return (
    <main className="console-page" aria-busy="true">
      <p className="sr-only" role="status">
        Carregando os dados do banco…
      </p>
      <div className="skeleton" style={{ width: '40%', height: 32 }} />
      <div className="skeleton" style={{ width: '85%' }} />
      <div className="skeleton" style={{ width: '70%' }} />
      <div className="stats">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 72 }} />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton" style={{ height: 40 }} />
      ))}
    </main>
  );
}
