import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { ConsoleService } from './console.service';

const consoleSchema = z.object({ resourceId: z.uuid(), sql: z.string().trim().min(1).max(2000) }).strict();

@ApiTags('Console SQL')
@ApiCookieAuth()
@Controller('console')
export class ConsoleController {
  constructor(private readonly console: ConsoleService) {}

  @Post('execute')
  @HttpCode(200)
  @RequirePermission('query:execute')
  @ApiOperation({ summary: 'Executa um comando SQL com o acesso ao recurso: Leitura só lê (READ ONLY), Escrita altera; o papel do banco limita a tabela, um comando por vez' })
  execute(@Body() body: unknown, @Req() req: Request) {
    const parsed = consoleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Informe o recurso e um comando SQL de até 2000 caracteres');
    return this.console.execute(parsed.data.resourceId, currentUser(req).id, parsed.data.sql);
  }
}
