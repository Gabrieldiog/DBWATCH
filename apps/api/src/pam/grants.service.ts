import { ConflictException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuditedTransaction } from '../audit/audited-transaction';
import { runWithContext } from '../common/correlation-id';
import type { Env } from '../config/env';
import { ENV, PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';

// O estado é calculado pelo relógio do banco na hora da consulta (ADR-010): se o job parar, o acesso expira mesmo assim
const STATE = Prisma.sql`CASE WHEN g.revoked_at IS NOT NULL THEN 'REVOKED' WHEN now() >= g.expires_at THEN 'EXPIRED'
  WHEN now() < g.starts_at THEN 'SCHEDULED' ELSE 'ACTIVE' END`;
const COLUMNS = Prisma.sql`g.id, ${STATE} AS state, g.access_level::text AS "accessLevel", g.starts_at AS "startsAt",
  g.expires_at AS "expiresAt", greatest(0, extract(epoch FROM g.expires_at - now()))::int AS "secondsLeft",
  (g.revoked_at IS NULL AND now() < g.expires_at AND g.expires_at - now() <= interval '5 minutes') AS "expiresSoon",
  json_build_object('id', s.id, 'name', s.name, 'sensitivity', s.sensitivity) AS resource`;

@Injectable()
export class GrantsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GrantsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly audited: AuditedTransaction,
    @Inject(ENV) private readonly env: Env,
  ) {}

  mine(userId: string) {
    return this.prisma.asActor((tx) => tx.$queryRaw`
      SELECT ${COLUMNS} FROM pam.access_grants g JOIN pam.resources s ON s.id = g.resource_id
       WHERE g.user_id = ${userId}::uuid ORDER BY g.starts_at DESC LIMIT 50`);
  }

  active() {
    return this.prisma.asActor((tx) => tx.$queryRaw`
      SELECT ${COLUMNS}, json_build_object('id', u.id, 'email', u.email) AS "user"
        FROM pam.access_grants g JOIN pam.resources s ON s.id = g.resource_id JOIN iam.users u ON u.id = g.user_id
       WHERE g.revoked_at IS NULL AND now() < g.expires_at ORDER BY g.expires_at`);
  }

  // UPDATE condicional: só revoga o que ainda está vivo; revogar de novo ou depois de expirar é 409
  revoke(id: string, revokerId: string, reason: string) {
    return this.audited.run({ action: 'pam.grant_revoke', resourceType: 'access_grant', resourceId: id, metadata: { motivo: reason } }, async (tx) => {
      const done = await tx.$executeRaw`
        UPDATE pam.access_grants SET revoked_at = now(), revoked_by = ${revokerId}::uuid, revoke_reason = ${reason}
         WHERE id = ${id}::uuid AND revoked_at IS NULL AND now() < expires_at`;
      if (done === 1) return { id, state: 'REVOKED' };
      const exists = await tx.accessGrant.findUnique({ where: { id }, select: { id: true } });
      throw exists ? new ConflictException('A concessão já foi revogada ou expirou') : new NotFoundException('Concessão não encontrada');
    });
  }

  // O job não decide nada: só marca e audita as expirações, cada uma uma vez, na mesma transação
  async sweepExpired(): Promise<number> {
    return runWithContext({ correlationId: randomUUID(), permissions: ['grant:revoke'] }, () =>
      this.prisma.asActor(async (tx) => {
        const expired = await tx.$queryRaw<{ id: string; user_id: string }[]>`
          UPDATE pam.access_grants SET expiry_audited_at = now()
           WHERE revoked_at IS NULL AND expires_at <= now() AND expiry_audited_at IS NULL
          RETURNING id, user_id`;
        for (const g of expired) {
          await this.audit.record({ action: 'pam.grant_expired', outcome: 'SUCCESS', actorId: null, resourceType: 'access_grant', resourceId: g.id, metadata: { usuario: g.user_id } }, tx);
        }
        return expired.length;
      }),
    );
  }

  onModuleInit(): void {
    if (this.env.GRANT_SWEEP_SECONDS === 0) return;
    this.timer = setInterval(() => {
      this.sweepExpired().catch((err: unknown) => this.logger.error(`Falha no job de expiração: ${err instanceof Error ? err.name : 'erro'}`));
    }, this.env.GRANT_SWEEP_SECONDS * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}
