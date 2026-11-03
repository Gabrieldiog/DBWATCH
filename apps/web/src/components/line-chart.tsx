'use client';

import { useState, type PointerEvent } from 'react';
import { linePath, niceMax, summary, time, type Point } from '../lib/monitor';

const W = 600;
const H = 120;

// Uma série por gráfico: commits e rollbacks têm escalas muito diferentes, e dois eixos no mesmo desenho enganam
export function LineChart({ title, unit, points }: { title: string; unit: string; points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(points.map((p) => p.v));
  const text = summary(points, unit);
  const at = hover === null ? null : points[hover];
  const label = unit[0]!.toUpperCase() + unit.slice(1);
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 0);

  function move(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const i = Math.round(((event.clientX - box.left) / box.width) * (points.length - 1));
    setHover(points.length ? Math.min(points.length - 1, Math.max(0, i)) : null);
  }

  return (
    <figure className="panel chart">
      <figcaption>
        <strong>{title}</strong>
        <span>{text}</span>
      </figcaption>
      <div className="chart-plot">
        <span className="chart-max">{max}</span>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title}. ${text}`}
          onPointerMove={move}
          onPointerLeave={() => setHover(null)}
        >
          <line x1="0" x2={W} y1="0" y2="0" className="chart-grid" />
          <line x1="0" x2={W} y1={H} y2={H} className="chart-base" />
          <path d={linePath(points, W, H, max)} className="chart-line" />
          {hover !== null && <line x1={(x(hover) * W) / 100} x2={(x(hover) * W) / 100} y1="0" y2={H} className="chart-cross" />}
        </svg>
        {at && (
          <p className="chart-tip" style={{ left: `${Math.min(85, Math.max(15, x(hover!)))}%` }} aria-hidden>
            {time(at.t)} · {at.v ?? 'sem dado'} {at.v === null ? '' : unit}
          </p>
        )}
      </div>
      <p className="chart-axis" aria-hidden>
        <span>{points[0] ? time(points[0].t) : ''}</span>
        <span>{points.at(-1) ? time(points.at(-1)!.t) : ''}</span>
      </p>
      <details>
        <summary>Ver como tabela (último minuto)</summary>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Amostra</th>
              <th scope="col">{label}</th>
            </tr>
          </thead>
          <tbody>
            {points.slice(-12).reverse().map((p) => (
              <tr key={p.t}>
                <td data-label="Amostra">{time(p.t)}</td>
                <td data-label={label}>{p.v ?? 'sem dado (contador reiniciou)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
