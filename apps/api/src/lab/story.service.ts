import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditedTransaction } from '../audit/audited-transaction';
import { AuditService } from '../audit/audit.service';
import { describeFailure, sqlStateOf } from '../audit/failure';
import { DEMO_USERS } from '../auth/demo-users';
import { runWithContext } from '../common/correlation-id';
import { PrismaService } from '../database/prisma.service';
import { GrantsService } from '../pam/grants.service';
import { QueriesService } from '../pam/queries.service';
import { RequestsService } from '../pam/requests.service';
import type { Narrate } from './simulation';

type Actor = { id: string; name: string; permissions: string[] };
type Done<T> = { cid: string; value?: T; error?: unknown };

// Só os personagens do seed (@dbwatch.test): o bot nunca age como uma pessoa real cadastrada
const demo = (role: string) => DEMO_USERS.find((u) => u.role === role)!.email;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Tempo entre as ações do Ato 1 e do Ato 3 no modo automático: dá para ler cada evento antes do próximo (PK-25)
const PASSO = 5_000;
const TIME = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

// LAB: os atos 1 e 3 da simulação. Cada ação passa pelo mesmo serviço da rota HTTP, com RLS, CHECKs e auditoria;
// só o guard da rota fica de fora, porque quem "clica" é o bot, como a pessoa
@Injectable()
export class StoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly audited: AuditedTransaction,
    private readonly requests: RequestsService,
    private readonly grants: GrantsService,
    private readonly queries: QueriesService,
  ) {}

  private async actor(email: string): Promise<Actor | null> {
    const u = await this.prisma.user.findFirst({
      where: { email, status: 'ACTIVE' },
      select: { id: true, displayName: true, roles: { select: { role: { select: { permissions: { select: { permissionCode: true } } } } } } },
    });
    if (!u) return null;
    const permissions = [...new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionCode)))];
    return { id: u.id, name: u.displayName.split(' ')[0]!, permissions };
  }

  // Um código de execução por ação, como cada clique na tela; extra simula uma permissão que a API deixou passar por engano
  private async as<T>(a: Actor, starter: string, work: () => Promise<T>, extra: string[] = []): Promise<Done<T>> {
    const cid = randomUUID();
    try {
      const value = await runWithContext({ correlationId: cid, userId: a.id, permissions: [...a.permissions, ...extra], simulation: starter }, work);
      return { cid, value };
    } catch (error) {
      return { cid, error };
    }
  }

  private must<T>(done: Done<T>): T {
    if (done.error) throw done.error;
    return done.value!;
  }

  async actOne(narrate: Narrate, starter: string): Promise<void> {
    const [diego, bruno] = await Promise.all([this.actor(demo('REQUESTER')), this.actor(demo('APPROVER'))]);
    const resource = await this.prisma.resource.findFirst({ where: { name: 'Clientes', active: true }, select: { id: true } });
    if (!diego || !bruno || !resource) {
      return narrate('medium', 'Ato 1 pulado', 'Faltam os usuários de demonstração ou o recurso Clientes (rode pnpm db:seed). O incidente roda mesmo assim.');
    }
    await narrate('info', 'Ato 1: um acesso do começo ao fim', `${diego.name} precisa ver o cadastro de clientes. Cada ação passa pelas regras da API e do banco, e a auditoria marca como simulação.`);
    await this.reset(diego, bruno, resource.id, starter);
    await pause(PASSO);

    const created = await this.as(diego, starter, () =>
      this.requests.create({ resourceId: resource.id, accessLevel: 'READ', requestedMinutes: 15, justification: 'Conferir o cadastro de clientes antes da campanha de novembro', approverId: bruno.id }, diego.id),
    );
    const id = this.must(created).id;
    await narrate('info', `${diego.name} pediu acesso`, 'Leitura em Clientes por 15 min, com justificativa. O pedido nasce Pendente.', created.cid);
    await pause(PASSO);

    const self = await this.as(diego, starter, () => this.requests.approve(id, diego.id));
    await narrate('high', `${diego.name} tentou aprovar o próprio pedido`, `A API recusou: ${(self.error as Error | undefined)?.message ?? 'passou (não deveria)'}.`, self.cid,
      'A API confere se quem aprova é a mesma pessoa que pediu e responde 403 antes de tocar no banco. Quem pede não aprova: é a separação de funções.');
    await pause(PASSO);

    // Como se a checagem da API tivesse um bug: o UPDATE vai direto ao banco, e a CHECK de separação de funções decide
    const bypass = await this.as(diego, starter, () =>
      this.audited.run({ action: 'pam.request_approve', resourceType: 'access_request', resourceId: id, metadata: { caminho: 'sql_direto' } }, (tx) =>
        tx.$executeRaw`UPDATE pam.access_requests SET status = 'APPROVED', decided_by = requester_id, decided_at = now(), updated_at = now() WHERE id = ${id}::uuid`),
      ['request:review'],
    );
    const rule = bypass.error ? describeFailure(bypass.error).reason.split(' ')[1] : undefined;
    const why = bypass.error ? `o PostgreSQL recusou com ${sqlStateOf(bypass.error)}${rule ? `, regra ${rule}` : ''}` : 'o banco aceitou (não deveria)';
    await narrate('high', 'Teste: o banco também barra', `O bot pulou a API e mandou a mesma aprovação direto no banco: ${why}. O pedido continua Pendente.`, bypass.cid,
      `Para provar que a regra não depende só do código, o bot finge que a API tem um bug e grava a aprovação direto no PostgreSQL, com ${diego.name} aprovando o próprio pedido. A CHECK constraint da tabela de pedidos (quem decide precisa ser diferente de quem pediu) recusou, nada foi gravado, e por isso aparece um rollback logo depois.`);
    await pause(PASSO);

    const approved = await this.as(bruno, starter, () => this.requests.approve(id, bruno.id, 'Justificativa conferida'));
    const until = this.must(approved).grant?.expiresAt;
    await narrate('info', `${bruno.name} aprovou`, `Outra pessoa decidiu, e a concessão nasceu na mesma transação, valendo até ${until ? TIME.format(until) : '?'} pelo relógio do banco.`, approved.cid);
    await pause(PASSO);

    const query = await this.as(diego, starter, () => this.queries.execute('clientes_por_cidade', diego.id, { cidade: 'Goiânia' }));
    const { rowCount, durationMs } = this.must(query);
    await narrate('info', `${diego.name} consultou os clientes`, `${rowCount} linha(s) em ${durationMs} ms, só leitura e com e-mail mascarado. A execução ficou na auditoria.`, query.cid);
    await pause(PASSO);
  }

  // Pedido pendente ou acesso vivo de uma rodada anterior bateria na UNIQUE parcial ou na EXCLUDE: limpa pelo caminho normal
  private async reset(diego: Actor, bruno: Actor, resourceId: string, starter: string): Promise<void> {
    const found = await this.as(bruno, starter, () =>
      this.prisma.asActor(async (tx) => ({
        pending: await tx.accessRequest.findMany({ where: { requesterId: diego.id, resourceId, status: 'PENDING' }, select: { id: true } }),
        live: await tx.$queryRaw<{ id: string }[]>`SELECT id FROM pam.access_grants
          WHERE user_id = ${diego.id}::uuid AND resource_id = ${resourceId}::uuid AND revoked_at IS NULL AND now() < expires_at`,
      })),
    );
    const { pending, live } = this.must(found);
    for (const r of pending) this.must(await this.as(diego, starter, () => this.requests.cancel(r.id, diego.id)));
    for (const g of live) this.must(await this.as(bruno, starter, () => this.grants.revoke(g.id, bruno.id, 'Palco limpo para a simulação')));
  }

  async actThree(narrate: Narrate, starter: string): Promise<void> {
    const eva = await this.actor(demo('AUDITOR'));
    if (!eva) return narrate('medium', 'Ato 3 pulado', 'Falta a usuária de auditoria do seed (rode pnpm db:seed).');
    await narrate('info', 'Ato 3: alguém confere tudo', `${eva.name}, da auditoria, recalcula a cadeia de hash da trilha inteira dentro do banco.`);
    await pause(PASSO);
    const verified = await this.as(eva, starter, () => this.audit.verifyRecorded());
    const r = this.must(verified);
    await narrate(
      r.intact ? 'info' : 'high',
      `${eva.name} verificou a trilha`,
      r.intact
        ? `Cadeia íntegra: ${r.checked} registros conferidos, incluindo cada passo desta simulação.`
        : `A cadeia quebra no registro ${r.firstBrokenPosition}: a auditoria foi alterada fora do sistema.`,
      verified.cid,
    );
  }
}
