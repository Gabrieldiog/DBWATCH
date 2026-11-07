import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../auth/permissions';
import { AuditService } from './audit.service';

const filterSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.coerce.number().int().positive().optional(),
    action: z.string().regex(/^[a-z]+(\.[a-z_]+)+$/).optional(),
    outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE']).optional(),
    actorId: z.uuid().optional(),
    // Quem lê a auditoria não lista usuários: a tela filtra pessoa pelo e-mail
    actorEmail: z.email().max(254).optional(),
    resourceId: z.string().max(120).optional(),
    correlationId: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

@ApiTags('Auditoria')
@ApiCookieAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Trilha de auditoria, da mais recente para a mais antiga, com filtros e cursor' })
  list(@Query() query: Record<string, string>) {
    const parsed = filterSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Filtro inválido');
    return this.audit.list(parsed.data);
  }

  @Get('verify')
  @RequirePermission('audit:verify')
  @ApiOperation({ summary: 'Recalcula a cadeia de hash e aponta a primeira linha adulterada, se houver' })
  verify() {
    return this.audit.verifyRecorded();
  }
}
