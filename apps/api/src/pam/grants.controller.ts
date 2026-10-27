import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { GrantsService } from './grants.service';

const revokeSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

@ApiTags('Concessões')
@ApiCookieAuth()
@Controller('grants')
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  @Get('mine')
  @RequirePermission('grant:read:own')
  @ApiOperation({ summary: 'Meus acessos, com estado, segundos restantes e aviso de expiração em breve (5 min)' })
  mine(@Req() req: Request) {
    return this.grants.mine(currentUser(req).id);
  }

  @Get('active')
  @RequirePermission('grant:revoke')
  @ApiOperation({ summary: 'Concessões vivas de todos, das que vencem primeiro às últimas' })
  active() {
    return this.grants.active();
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermission('grant:revoke')
  @ApiOperation({ summary: 'Revoga com motivo; vale na requisição seguinte' })
  revoke(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Informe o motivo da revogação (5 a 500 caracteres)');
    return this.grants.revoke(id, currentUser(req).id, parsed.data.reason);
  }
}
