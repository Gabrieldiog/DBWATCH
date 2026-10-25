import { Injectable } from '@nestjs/common';
import { type AuditTarget, AuditedTransaction } from '../audit/audited-transaction';
import { PrismaService } from '../database/prisma.service';
import { toHttpError } from '../iam/db-errors';
import type { NewRequest } from './requests.schemas';

const FIELDS = {
  id: true, accessLevel: true, requestedMinutes: true, justification: true, status: true,
  createdAt: true, decidedAt: true, decisionNote: true, resource: { select: { id: true, name: true, sensitivity: true } },
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
    try {
      return await this.audited.run(target, async (tx) => {
        const created = await tx.accessRequest.create({ data: { ...input, requesterId }, select: FIELDS });
        target.resourceId = created.id;
        return created;
      });
    } catch (err) {
      throw toHttpError(err, 'Você já tem um pedido pendente para esse recurso');
    }
  }

  mine(requesterId: string) {
    return this.prisma.accessRequest.findMany({ where: { requesterId }, select: FIELDS, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  // Fila do aprovador, mais antigos primeiro; os pedidos dele mesmo não aparecem (ele não pode decidi-los)
  queue(reviewerId: string) {
    return this.prisma.accessRequest.findMany({
      where: { status: 'PENDING', requesterId: { not: reviewerId } },
      select: { ...FIELDS, requester: { select: { id: true, email: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
