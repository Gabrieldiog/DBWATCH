import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type AuditTarget, AuditedTransaction } from '../audit/audited-transaction';
import { PrismaService, type Tx } from '../database/prisma.service';
import { toHttpError } from '../iam/db-errors';
import type { NewRequest } from './requests.schemas';

const FIELDS = {
  id: true, accessLevel: true, requestedMinutes: true, justification: true, status: true,
  createdAt: true, decidedAt: true, decisionNote: true, firstApprovedAt: true, resource: { select: { id: true, name: true, sensitivity: true } },
} as const;

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audited: AuditedTransaction,
  ) {}

  resources() {
    return this.prisma.resource.findMany({
      where: { active: true },
      select: { id: true, name: true, databaseName: true, sensitivity: true, maxGrantMinutes: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(input: NewRequest, requesterId: string) {
    const target: AuditTarget = {
      action: 'pam.request_create',
      resourceType: 'access_request',
      metadata: { recurso: input.resourceId, nivel: input.accessLevel, minutos: input.requestedMinutes },
    };
    return this.run(target, async (tx) => {
      const created = await tx.accessRequest.create({ data: { ...input, requesterId }, select: FIELDS });
      target.resourceId = created.id;
      return created;
    });
  }

  mine(requesterId: string) {
    return this.prisma.asActor((tx) =>
      tx.accessRequest.findMany({ where: { requesterId }, select: FIELDS, orderBy: { createdAt: 'desc' }, take: 50 }),
    );
  }

  // Filtro duplo: o WHERE da aplicação e a RLS do banco. Sem permissão, pedido alheio responde 404 (não revela que existe)
  async findOne(id: string, userId: string, canReview: boolean) {
    const found = await this.prisma.asActor((tx) =>
      tx.accessRequest.findFirst({ where: { id, ...(canReview ? {} : { requesterId: userId }) }, select: FIELDS }),
    );
    if (!found) throw new NotFoundException('Pedido não encontrado');
    return found;
  }

  // UPDATE condicional (WHERE status = 'PENDING'): com dois aprovadores ao mesmo tempo, o segundo espera o lock da linha,
  // relê a versão nova, não casa mais com o WHERE e afeta 0 linhas. Pedido aprovado e concessão: mesma transação
  approve(id: string, reviewerId: string, note?: string) {
    return this.decide('pam.request_approve', id, reviewerId, async (tx) => {
      // Recurso HIGH: a primeira aprovação só registra quem aprovou; a concessão sai na segunda, de outra pessoa
      const [stage] = await tx.$queryRaw<{ sensitivity: string; first_approved_by: string | null }[]>`
        SELECT s.sensitivity::text, r.first_approved_by FROM pam.access_requests r
          JOIN pam.resources s ON s.id = r.resource_id WHERE r.id = ${id}::uuid`;
      if (stage!.sensitivity === 'HIGH' && !stage!.first_approved_by) {
        const first = await tx.$executeRaw`
          UPDATE pam.access_requests SET first_approved_by = ${reviewerId}::uuid, first_approved_at = now(), updated_at = now()
           WHERE id = ${id}::uuid AND status = 'PENDING' AND first_approved_by IS NULL`;
        if (first === 0) throw new ConflictException('O pedido mudou enquanto você decidia; atualize e tente de novo');
        return { id, status: 'PENDING', approvals: 1, required: 2 };
      }
      if (stage!.first_approved_by === reviewerId) throw new ForbiddenException('A segunda aprovação precisa ser de outra pessoa');
      const [req] = await tx.$queryRaw<{ requester_id: string; resource_id: string; access_level: string; requested_minutes: number }[]>`
        UPDATE pam.access_requests
           SET status = 'APPROVED', decided_by = ${reviewerId}::uuid, decided_at = now(), decision_note = ${note ?? null}, updated_at = now()
         WHERE id = ${id}::uuid AND status = 'PENDING'
        RETURNING requester_id, resource_id, access_level::text, requested_minutes`;
      if (!req) throw new ConflictException('O pedido já foi decidido ou cancelado');
      const [grant] = await tx.$queryRaw<{ id: string; expires_at: Date }[]>`
        INSERT INTO pam.access_grants (request_id, user_id, resource_id, access_level, starts_at, expires_at)
        VALUES (${id}::uuid, ${req.requester_id}::uuid, ${req.resource_id}::uuid, ${req.access_level}::pam.access_level,
                now(), now() + make_interval(mins => ${req.requested_minutes}))
        RETURNING id, expires_at`;
      const required = stage!.sensitivity === 'HIGH' ? 2 : 1;
      return { id, status: 'APPROVED', approvals: required, required, grant: { id: grant!.id, expiresAt: grant!.expires_at } };
    });
  }

  reject(id: string, reviewerId: string, note: string) {
    return this.decide('pam.request_reject', id, reviewerId, async (tx) => {
      const { count } = await tx.accessRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REJECTED', decidedById: reviewerId, decidedAt: new Date(), decisionNote: note },
      });
      if (count === 0) throw new ConflictException('O pedido já foi decidido ou cancelado');
      return { id, status: 'REJECTED' };
    });
  }

  async cancel(id: string, requesterId: string): Promise<void> {
    await this.run({ action: 'pam.request_cancel', resourceType: 'access_request', resourceId: id }, async (tx) => {
      const { count } = await tx.accessRequest.updateMany({ where: { id, requesterId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      if (count === 0) throw new NotFoundException('Pedido pendente não encontrado');
    });
  }

  // Ninguém decide o próprio pedido: checado aqui (403 auditado como DENIED) e garantido pela CHECK do banco
  private decide<T>(action: string, id: string, reviewerId: string, work: (tx: Tx) => Promise<T>) {
    return this.run({ action, resourceType: 'access_request', resourceId: id }, async (tx) => {
      const req = await tx.accessRequest.findUnique({ where: { id }, select: { requesterId: true } });
      if (!req) throw new NotFoundException('Pedido não encontrado');
      if (req.requesterId === reviewerId) throw new ForbiddenException('Ninguém decide o próprio pedido');
      return work(tx);
    });
  }

  private async run<T>(target: AuditTarget, work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.audited.run(target, work);
    } catch (err) {
      throw toHttpError(err, 'Você já tem um pedido pendente para esse recurso');
    }
  }

  // Fila do aprovador, mais antigos primeiro; os pedidos dele mesmo não aparecem (ele não pode decidi-los)
  queue(reviewerId: string) {
    return this.prisma.asActor((tx) => tx.accessRequest.findMany({
      where: { status: 'PENDING', requesterId: { not: reviewerId } },
      select: { ...FIELDS, requester: { select: { id: true, email: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    }));
  }
}
