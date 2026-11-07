'use client';

import { useEffect, useState } from 'react';
import { describeEvent, fromStream, SEVERITY, sourceOf, time, type MonitorEvent } from '../lib/monitor';
import { Badge } from './badge';

const STATE = { connecting: 'Conectando ao fluxo ao vivo…', on: 'Ao vivo: eventos novos entram no topo na hora.', off: 'Conexão perdida. O navegador tenta de novo sozinho.' };

// A lista inicial vem do servidor uma vez; depois disso só o SSE muda a lista (o refresh da tela não mexe aqui)
export function EventFeed({ initial, canAudit }: { initial: MonitorEvent[]; canAudit: boolean }) {
  const [events, setEvents] = useState(initial);
  const [state, setState] = useState<keyof typeof STATE>('connecting');

  useEffect(() => {
    const source = new EventSource('/api/monitor/stream');
    // A API manda eventos com nome (TX_ROLLBACK, ALERT): o onmessage padrão não receberia nenhum
    const add = (msg: MessageEvent<string>) => {
      const e = fromStream(JSON.parse(msg.data));
      setEvents((list) => [e, ...list.filter((x) => x.id !== e.id)].slice(0, 8));
    };
    for (const kind of ['TX_ROLLBACK', 'ALERT']) source.addEventListener(kind, add);
    source.onopen = () => setState('on');
    source.onerror = () => setState('off');
    return () => source.close();
  }, []);

  return (
    <>
      <p className="note">{STATE[state]}</p>
      {events.length === 0 ? (
        <p className="panel">Nenhum evento ainda. Rollbacks da API e alertas do coletor aparecem aqui assim que acontecem.</p>
      ) : (
        <ol className="events" aria-live="polite">
          {events.map((e) => {
            const [title, detail] = describeEvent(e);
            const [source, tone] = sourceOf(e);
            return (
              <li key={e.id} className={`panel event event-${tone} ${e.fresh ? 'event-new' : ''}`}>
                <Badge entry={SEVERITY[e.severity]} fallback={e.severity} />
                <strong>{title}</strong>
                <span>{detail}</span>
                <span className="note">
                  Fonte: {source} · {time(e.occurredAt)}
                  {canAudit && e.correlationId && (
                    <>
                      {' · '}
                      <a href={`/auditoria?correlationId=${e.correlationId}`}>ver na auditoria</a>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
