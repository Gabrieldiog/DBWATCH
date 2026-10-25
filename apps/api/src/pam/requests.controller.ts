import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { newRequestSchema } from './requests.schemas';
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

  @Get('requests/mine')
  @RequirePermission('request:read:own')
  @ApiOperation({ summary: 'Meus pedidos, do mais recente ao mais antigo' })
  mine(@Req() req: Request) {
    return this.requests.mine(currentUser(req).id);
  }

  @Get('requests/queue')
  @RequirePermission('request:review')
  @ApiOperation({ summary: 'Fila de pedidos pendentes para o aprovador' })
  queue(@Req() req: Request) {
    return this.requests.queue(currentUser(req).id);
  }
}
