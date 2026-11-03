import { layout, type Lock } from '../lib/monitor';

const who = (pid: number, app: string | null) => `pid ${pid}${app ? ` (${app})` : ''}`;

// Só a última amostra: lock mais curto que o intervalo da coleta pode não aparecer, e a tela diz isso
export function LockGraph({ locks }: { locks: Lock[] }) {
  if (!locks.length)
    return <p className="panel note">Nenhuma sessão esperando lock na última amostra. Locks mais curtos que o intervalo da coleta podem não aparecer.</p>;
  const { nodes, edges } = layout(locks);
  const [top, bottom] = [Math.min(...nodes.map((n) => n.y)) - 30, Math.max(...nodes.map((n) => n.y)) + 50];
  const text = locks.map((l) => `${who(l.blockingPid, l.blockingApp)} bloqueia ${who(l.blockedPid, l.blockedApp)}`).join('; ');
  return (
    <figure className="panel chart">
      <figcaption>
        <strong>Quem bloqueia quem</strong>
        <span>A seta sai de quem segura o lock e aponta para quem espera.</span>
      </figcaption>
      <svg viewBox={`-150 ${top} 300 ${bottom - top}`} className="lock-graph" role="img" aria-label={text}>
        <defs>
          <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" className="lock-head" />
          </marker>
        </defs>
        {edges.map(({ key, ...line }) => (
          <line key={key} {...line} className="lock-edge" markerEnd="url(#seta)" />
        ))}
        {nodes.map((n) => (
          <g key={n.pid} transform={`translate(${n.x} ${n.y})`} className={n.waiting ? 'lock-node lock-waiting' : 'lock-node'}>
            <circle r="22" />
            <text dy="5">{n.pid}</text>
            <text dy="40" className="lock-app">{n.app.slice(0, 18)}</text>
          </g>
        ))}
      </svg>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Segura o lock</th>
            <th scope="col">Esperando</th>
            <th scope="col">Lock</th>
            <th scope="col">Espera</th>
          </tr>
        </thead>
        <tbody>
          {locks.map((l) => (
            <tr key={`${l.blockingPid}-${l.blockedPid}`}>
              <td data-label="Segura o lock">{who(l.blockingPid, l.blockingApp)}</td>
              <td data-label="Esperando">{who(l.blockedPid, l.blockedApp)}</td>
              <td data-label="Lock">
                {l.locktype} · {l.mode}
                {l.relation ? ` · ${l.relation}` : ''}
              </td>
              <td data-label="Espera">{(Number(l.waitMs) / 1000).toFixed(1)} s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
