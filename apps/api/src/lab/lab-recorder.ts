import type { Client } from 'pg';

export type Session = 'A' | 'B';

export interface LabStep {
  at: number;
  session: Session;
  sql?: string;
  note?: string;
  ms?: number;
  result?: 'ok' | 'erro';
  sqlstate?: string;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Grava cada passo com tempo e SQLSTATE; nunca lança: o erro do banco é o resultado do experimento
export class LabRecorder {
  readonly steps: LabStep[] = [];
  private readonly t0 = performance.now();

  constructor(
    private readonly clients: Record<Session, Client>,
    private readonly pids: Record<Session, number>,
  ) {}

  async run(session: Session, sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; sqlstate?: string }> {
    const start = performance.now();
    const step: LabStep = { at: Math.round(start - this.t0), session, sql };
    this.steps.push(step);
    try {
      const res = await this.clients[session].query(sql, params);
      Object.assign(step, { ms: Math.round(performance.now() - start), result: 'ok' });
      return { rows: res.rows };
    } catch (err) {
      const sqlstate = (err as { code?: string }).code ?? 'XX000';
      Object.assign(step, { ms: Math.round(performance.now() - start), result: 'erro', sqlstate });
      return { rows: [], sqlstate };
    }
  }

  note(session: Session, text: string): void {
    this.steps.push({ at: Math.round(performance.now() - this.t0), session, note: text });
  }

  // Barreira: espera a sessão ficar parada aguardando um lock (visto pelo próprio PostgreSQL)
  async waitForLock(session: Session): Promise<void> {
    const other = session === 'A' ? 'B' : 'A';
    for (let i = 0; i < 100; i++) {
      const { rows } = await this.clients[other].query("SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [this.pids[session]]);
      if (rows.length) return this.note(session, `${session} está esperando um lock`);
      await pause(20);
    }
    this.note(session, `${session} não chegou a esperar lock`);
  }

  pause = pause;
}
