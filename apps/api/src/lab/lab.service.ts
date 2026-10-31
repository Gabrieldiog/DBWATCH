import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Client } from 'pg';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { ENV } from '../database/prisma.service';
import { LabRecorder } from './lab-recorder';
import { SCENARIOS } from './scenarios';

// Um experimento por vez no banco inteiro: advisory lock de sessão, solto quando a conexão fecha
const LAB_LOCK = 4_242_001;
const RESET = `INSERT INTO lab.accounts VALUES (1, 'Ana', 100), (2, 'Bruno', 50)
  ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner, balance = EXCLUDED.balance`;

@Injectable()
export class LabService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  scenarios() {
    this.enabled();
    return Object.entries(SCENARIOS).map(([name, s]) => ({ name, title: s.title }));
  }

  async run(name: string, userId: string) {
    const url = this.enabled();
    const scenario = SCENARIOS[name];
    if (!scenario) throw new NotFoundException('Cenário inexistente');
    // Duas conexões reais e dedicadas, uma por sessão, identificadas no pg_stat_activity
    const [a, b] = (['A', 'B'] as const).map((s) => new Client({ connectionString: url, application_name: `dbwatch-lab:${s}` }));
    await Promise.all([a!.connect(), b!.connect()]);
    try {
      const { rows } = await a!.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LAB_LOCK]);
      if (!rows[0]!.ok) throw new ConflictException('Já existe um experimento rodando; tente em alguns segundos');
      await a!.query(RESET);
      const pid = async (c: Client) => (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      const lab = new LabRecorder({ A: a!, B: b! }, { A: await pid(a!), B: await pid(b!) });
      const startedAt = new Date();
      const outcome = (await scenario.run(lab)) ? 'OK' : 'FAILED';
      const { rows: saved } = await a!.query<{ id: string }>(
        'INSERT INTO lab.runs (scenario, started_by, started_at, outcome, steps) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [name, userId, startedAt, outcome, JSON.stringify(lab.steps)],
      );
      await this.audit.record({ action: 'lab.run', outcome: 'SUCCESS', resourceType: 'lab_run', resourceId: saved[0]!.id, metadata: { cenario: name, resultado: outcome } });
      return { id: Number(saved[0]!.id), scenario: name, outcome, steps: lab.steps };
    } finally {
      // Fechar a conexão desfaz qualquer transação aberta e solta o advisory lock
      await Promise.all([a!.end(), b!.end()]);
    }
  }

  async runs() {
    const client = new Client({ connectionString: this.enabled(), application_name: 'dbwatch-lab:leitura' });
    await client.connect();
    try {
      return (await client.query('SELECT id::int, scenario, started_at AS "startedAt", outcome, jsonb_array_length(steps) AS steps FROM lab.runs ORDER BY id DESC LIMIT 20')).rows;
    } finally {
      await client.end();
    }
  }

  private enabled(): string {
    if (this.env.LAB_ENABLED !== 'true' || !this.env.LAB_DATABASE_URL) throw new NotFoundException('Laboratório desligado (LAB_ENABLED)');
    return this.env.LAB_DATABASE_URL;
  }
}
