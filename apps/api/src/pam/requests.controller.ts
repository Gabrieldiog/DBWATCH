import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { decisionSchema, newRequestSchema } from './requests.schemas';
import { RequestsService } from './requests.service';

@ApiTags('Pedidos de acesso')
@ApiCookieAuth()
@Controller()
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('resources')
  @RequirePermission('request:create')
  @ApiOperation({ summary: 'Recursos ativos que podem ser pedidos, com a duração máxima de cada um' })
  resources() {
    return this.requests.resources();
  }

  @Post('requests')
  @RequirePermission('request:create')
  @ApiOperation({ summary: 'Pede acesso temporário a um recurso (justificativa de 20 a 500 caracteres)' })
  create(@Body() body: unknown, @Req() req: Request) {
    const parsed = newRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return this.requests.create(parsed.data, currentUser(req).id);
  }

  @Post('requests/:id/approve')
  @HttpCode(200)
  @RequirePermission('request:review')
  @ApiOperation({ summary: 'Aprova e cria a concessão temporária na mesma transação; 409 se outro aprovador chegou antes' })
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    return this.requests.approve(id, currentUser(req).id, this.note(body));
  }

  @Post('requests/:id/reject')
  @HttpCode(200)
  @RequirePermission('request:review')
  @ApiOperation({ summary: 'Rejeita com um motivo obrigatório' })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const note = this.note(body);
    if (!note) throw new BadRequestException('Informe o motivo da rejeição');
    return this.requests.reject(id, currentUser(req).id, note);
  }

  @Post('requests/:id/cancel')
  @HttpCode(204)
  @RequirePermission('request:create')
  @ApiOperation({ summary: 'Cancela um pedido meu que ainda está pendente' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    await this.requests.cancel(id, currentUser(req).id);
  }

  @Get('requests/mine')
  @RequirePermission('request:read:own')
  @ApiOperation({ summary: 'Meus pedidos, do mais recente ao mais antigo' })
  mine(@Req() req: Request) {
    return this.requests.mine(currentUser(req).id);
  }

  private note(body: unknown): string | undefined {
    const parsed = decisionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Motivo deve ter de 5 a 500 caracteres');
    return parsed.data.note;
  }

  @Get('requests/queue')
  @RequirePermission('request:review')
  @ApiOperation({ summary: 'Fila de pedidos pendentes para o aprovador' })
  queue(@Req() req: Request) {
    return this.requests.queue(currentUser(req).id);
  }

  // Por último: :id não pode capturar /requests/mine nem /requests/queue
  @Get('requests/:id')
  @RequirePermission('request:read:own')
  @ApiOperation({ summary: 'Um pedido: o dono ou um aprovador vê; para os outros, 404' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = currentUser(req);
    return this.requests.findOne(id, user.id, user.permissions.includes('request:review'));
  }
}
