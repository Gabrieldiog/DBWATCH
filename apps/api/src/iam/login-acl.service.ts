import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditMetadata } from '../audit/audit.service';
import { type AuditTarget, AuditedTransaction } from '../audit/audited-transaction';
import { PrismaService, type Tx } from '../database/prisma.service';
import { toHttpError } from './db-errors';
import type { AclRule } from './login-acl.schemas';

interface AclRow {
  id: string;
  priority: number;
  action: string;
  ipRange: string | null;
  userId: string | null;
  weekdays: number[] | null;
  startTime: string | null;
  endTime: string | null;
  description: string;
}

const SELECT = `id, priority, action::text AS action, text(ip_range) AS "ipRange", user_id AS "userId", weekdays::int[] AS weekdays,
  to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime", description`;

// Resumo legível da regra para a auditoria: o "antes" de uma remoção e o "depois" de uma criação
const summary = (r: AclRule | AclRow): AuditMetadata => ({
  prioridade: r.priority,
  acao: r.action,
  faixa_ip: r.ipRange ?? 'qualquer',
  usuario: r.userId ?? 'todos',
  dias: r.weekdays?.join(',') ?? 'todos',
  horario: r.startTime ? `${r.startTime}-${r.endTime}` : 'dia todo',
});

@Injectable()
export class LoginAclService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audited: AuditedTransaction,
  ) {}

  list() {
    return this.prisma.$queryRawUnsafe<AclRow[]>(`SELECT ${SELECT} FROM iam.login_acl ORDER BY priority, created_at`);
  }

  async create(r: AclRule, actorId: string) {
    const target: AuditTarget = { action: 'iam.acl_create', resourceType: 'login_acl', metadata: summary(r) };
    return this.run(target, async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO iam.login_acl (priority, action, ip_range, user_id, weekdays, start_time, end_time, description, created_by)
        VALUES (${r.priority}, ${r.action}::iam.acl_action, ${r.ipRange ?? null}::inet, ${r.userId ?? null}::uuid,
                ${r.weekdays ?? null}::smallint[], ${r.startTime ?? null}::time, ${r.endTime ?? null}::time,
                ${r.description}, ${actorId}::uuid)
        RETURNING id`;
      target.resourceId = row!.id;
      return row!;
    });
  }

  async remove(id: string) {
    const target: AuditTarget = { action: 'iam.acl_delete', resourceType: 'login_acl', resourceId: id };
    await this.run(target, async (tx) => {
      // DELETE ... RETURNING apaga e devolve a linha numa operação só: o "antes" da auditoria sai do próprio DELETE
      const [before] = await tx.$queryRawUnsafe<AclRow[]>(
        `WITH d AS (DELETE FROM iam.login_acl WHERE id = $1::uuid RETURNING *) SELECT ${SELECT} FROM d`,
        id,
      );
      if (!before) throw new NotFoundException('Regra não encontrada');
      target.metadata = summary(before);
    });
  }

  private async run<T>(target: AuditTarget, work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.audited.run(target, work);
    } catch (err) {
      throw toHttpError(err);
    }
  }
}
