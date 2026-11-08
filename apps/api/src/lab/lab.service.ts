import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Client } from 'pg';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Env } from '../config/env';
import { ENV } from '../database/prisma.service';
import { LabRecorder } from './lab-recorder';
import { SCENARIOS } from './scenarios';
import { runIncident, type Narrate } from './simulation';
import { StoryService } from './story.service';

// Um experimento por vez no banco inteiro: advisory lock de sessão, solto quando a conexão fecha
const LAB_LOCK = 4_242_001;
// Ato 1 (~15 s), incidente (~35 s) e ato 3 (~5 s)
const SIMULATION_SECONDS = 55;
// Passo a passo: se ninguém clicar em "Próximo passo" em 5 min, o bot termina sozinho, sem parar mais, e solta o laboratório
const STEP_IDLE_MS = 5 * 60_000;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref());
// Quem apresenta controla o ritmo: o bot para em cada ponto seguro e espera o clique
type Stepper = { resume?: () => void; arrived?: (done: boolean) => void; landing?: Promise<boolean>; auto?: boolean };
// O Next corta o repasse para a API em 30 s: cada chamada espera no máximo 20 s e a tela pergunta de novo
const STEP_POLL_MS = 20_000;
const RESET = `INSERT INTO lab.accounts VALUES (1, 'Ana', 100), (2, 'Bruno', 50)
  ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner, balance = EXCLUDED.balance;
  INSERT INTO lab.on_call VALUES (1, 'Ana', true), (2, 'Bruno', true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, on_duty = EXCLUDED.on_duty`;

@Injectable()
export class LabService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly story: StoryService,
  ) {}

  private stepper?: Stepper;

  // Ponto de parada: avisa quem clicou que o passo terminou e espera o próximo clique (ou o tempo de folga)
  private readonly hold = async () => {
    const s = this.stepper;
    if (!s || s.auto) return;
    s.arrived?.(false);
    s.arrived = undefined;
    await Promise.race([new Promise<void>((r) => (s.resume = r)), wait(STEP_IDLE_MS)]);
    // Ninguém clicou: vira automático até o fim, e quem perguntar depois espera o fim
    if (s.resume) {
      s.resume = undefined;
      s.auto = true;
      this.arrival(s);
    }
  };

  private arrival(s: Stepper) {
    s.landing = new Promise<boolean>((r) => (s.arrived = r));
    return s.landing;
  }

  // Solta o bot para o próximo passo (se ele estiver parado) e responde quando ele parar de novo ou terminar
  async next() {
    const s = this.stepper;
    if (!s?.landing) throw new ConflictException('Nenhuma simulação passo a passo em andamento');
    const go = s.resume;
    if (go) {
      s.resume = undefined;
      this.arrival(s);
      go();
    }
    const landed = await Promise.race([s.landing, wait(STEP_POLL_MS).then(() => undefined)]);
    return { terminou: landed === true, parado: landed !== undefined };
  }

  // LAB: o bot roda em segundo plano (uns 55 s) e conta cada passo no fluxo de eventos do monitor.
  // A conexão guardiã segura o mesmo advisory lock dos experimentos até o fim: um por vez no banco inteiro
  async simulate(starter: string, stepByStep = false) {
    const url = this.enabled();
    const guard = new Client({ connectionString: url, application_name: 'dbwatch-lab:simulacao' });
    guard.on('error', () => undefined);
    await guard.connect();
    const { rows } = await guard.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LAB_LOCK]);
    if (!rows[0]!.ok) {
      await guard.end();
      throw new ConflictException('Já existe um experimento rodando; tente em alguns segundos');
    }
    await guard.query(RESET);
    await this.audit.record({ action: 'lab.simulation', outcome: 'SUCCESS', resourceType: 'lab_simulation', metadata: { cenario: 'fechamento-do-mes' } });
    const narrate: Narrate = async (severity, titulo, texto, correlationId) => {
      await this.prisma.$executeRaw`
        INSERT INTO monitor.app_events (kind, code, severity, operation, correlation_id, detail)
        VALUES ('LAB', 'SIM_STEP', ${severity}, 'lab.simulacao', ${correlationId ?? null}::uuid,
                jsonb_build_object('titulo', ${titulo}::text, 'texto', ${texto}::text))`;
    };
    const stepper: Stepper | undefined = stepByStep ? {} : undefined;
    this.stepper = stepper;
    const first = stepper && this.arrival(stepper);
    // Nos atos 1 e 3 cada ação é um passo; no incidente o bot só para onde nenhum lock fica preso esperando
    const step: Narrate = async (...args) => {
      await narrate(...args);
      await this.hold();
    };
    // Três atos: um acesso do começo ao fim, o incidente no banco e a verificação da trilha
    void (async () => {
      await step('info', 'Simulação iniciada', 'Três atos: um acesso do começo ao fim, um incidente no banco e alguém conferindo a trilha.');
      await this.story.actOne(step, starter);
      await runIncident(url, narrate, this.hold);
      await this.story.actThree(step, starter);
      await narrate('info', 'Simulação concluída', 'Tudo o que apareceu aqui aconteceu no PostgreSQL e está na auditoria, marcado como simulação.');
    })()
      .catch((err: unknown) => {
        const state = (err as { code?: string }).code;
        return narrate('high', 'A simulação parou com erro', state ? `SQLSTATE ${state}` : (err as Error).message);
      })
      .catch(() => undefined)
      .finally(() => {
        stepper?.arrived?.(true);
        if (this.stepper === stepper) this.stepper = undefined;
        return guard.end().catch(() => undefined);
      });
    if (first) return { status: 'passo a passo', terminou: await first, parado: true };
    return { status: 'iniciada', segundos: SIMULATION_SECONDS };
  }

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
