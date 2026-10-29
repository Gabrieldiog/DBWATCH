import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { BreakGlassService } from './break-glass.service';

const openSchema = z
  .object({ resourceId: z.uuid(), minutes: z.number().int().min(5).max(15), justification: z.string().trim().min(40).max(500) })
  .strict();
const reviewSchema = z.object({ note: z.string().trim().min(5).max(500) }).strict();

function parse<T extends z.ZodType>(schema: T, body: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}

@ApiTags('Break-glass')
@ApiCookieAuth()
@Controller('break-glass')
export class BreakGlassController {
  constructor(private readonly breakGlass: BreakGlassService) {}

  @Post()
  @RequirePermission('breakglass:use')
  @ApiOperation({ summary: 'Emergência: acesso imediato de até 15 min, sem aprovação prévia, auditado como alerta e revisado depois' })
  open(@Body() body: unknown, @Req() req: Request) {
    const input = parse(openSchema, body, 'Informe recurso, de 5 a 15 minutos e uma justificativa de pelo menos 40 caracteres');
    return this.breakGlass.open(input, currentUser(req).id);
  }

  @Get('pending')
  @RequirePermission('request:review')
  @ApiOperation({ summary: 'Break-glass ainda sem revisão' })
  pending() {
    return this.breakGlass.pending();
  }

  @Post(':id/review')
  @HttpCode(200)
  @RequirePermission('request:review')
  @ApiOperation({ summary: 'Revisa um break-glass depois do uso (outra pessoa, com nota)' })
  review(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    return this.breakGlass.review(id, currentUser(req).id, parse(reviewSchema, body, 'Escreva uma nota de revisão (5 a 500 caracteres)').note);
  }
}
