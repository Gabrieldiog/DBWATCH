import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { QueriesService } from './queries.service';

@ApiTags('Consultas controladas')
@ApiCookieAuth()
@Controller('queries')
export class QueriesController {
  constructor(private readonly queries: QueriesService) {}

  @Get()
  @RequirePermission('query:execute')
  @ApiOperation({ summary: 'Catálogo de consultas (o SQL não sai daqui: só código, título e parâmetros)' })
  catalog() {
    return this.queries.catalog();
  }

  @Post(':code/execute')
  @HttpCode(200)
  @RequirePermission('query:execute')
  @ApiOperation({ summary: 'Executa uma consulta do catálogo com uma concessão ativa; somente leitura, com tempo-limite' })
  execute(@Param('code') code: string, @Body() body: { params?: unknown } | undefined, @Req() req: Request) {
    return this.queries.execute(code, currentUser(req).id, body?.params);
  }
}
