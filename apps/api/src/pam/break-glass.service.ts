import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type AuditTarget, AuditedTransaction } from '../audit/audited-transaction';
import { PrismaService } from '../database/prisma.service';
import { toHttpError } from '../iam/db-errors';

export interface BreakGlassInput {
  resourceId: string;
  minutes: number;
  justification: string;
}

@Injectable()
export class BreakGlassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audited: AuditedTransaction,
  ) {}

  // Pedido já aprovado pelo próprio usuário e concessão na mesma transação; o banco confere permissão, prazo e justificativa
  async open(input: BreakGlassInput, userId: string) {
    const target: AuditTarget = {
      action: 'pam.break_glass',
      resourceType: 'access_request',
      metadata: { recurso: input.resourceId, minutos: input.minutes, alerta: true },
    };
    try {
      return await this.audited.run(target, async (tx) => {
        const [req] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO pam.access_requests
                 (requester_id, resource_id, access_level, requested_minutes, justification, status, decided_by, decided_at, decision_note, break_glass)
          VALUES (${userId}::uuid, ${input.resourceId}::uuid, 'READ', ${input.minutes}, ${input.justification},
                  'APPROVED', ${userId}::uuid, now(), 'break-glass', true)
          RETURNING id`;
        target.resourceId = req!.id;
        const [grant] = await tx.$queryRaw<{ id: string; expires_at: Date }[]>`
          INSERT INTO pam.access_grants (request_id, user_id, resource_id, access_level, starts_at, expires_at)
          VALUES (${req!.id}::uuid, ${userId}::uuid, ${input.resourceId}::uuid, 'READ', now(), now() + make_interval(mins => ${input.minutes}))
          RETURNING id, expires_at`;
        return { requestId: req!.id, grant: { id: grant!.id, expiresAt: grant!.expires_at } };
      });
    } catch (err) {
      throw toHttpError(err);
    }
  }

  // Fila de break-glass que ainda ninguém revisou, dos mais antigos aos mais novos
  pending() {
    return this.prisma.asActor((tx) =>
      tx.accessRequest.findMany({
        where: { breakGlass: true, reviewedById: null },
        select: {
          id: true, justification: true, requestedMinutes: true, createdAt: true,
          requester: { select: { id: true, email: true } }, resource: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async review(id: string, reviewerId: string, note: string) {
    try {
      return await this.audited.run({ action: 'pam.break_glass_review', resourceType: 'access_request', resourceId: id }, async (tx) => {
        const { count } = await tx.accessRequest.updateMany({
          where: { id, breakGlass: true, reviewedById: null },
          data: { reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note },
        });
        if (count === 1) return { id, reviewed: true };
        const exists = await tx.accessRequest.findFirst({ where: { id, breakGlass: true }, select: { id: true } });
        throw exists ? new ConflictException('Este break-glass já foi revisado') : new NotFoundException('Break-glass não encontrado');
      });
    } catch (err) {
      throw toHttpError(err);
    }
  }
}
