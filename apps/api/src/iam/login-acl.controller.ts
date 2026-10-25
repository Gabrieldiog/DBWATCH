import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { aclRuleSchema } from './login-acl.schemas';
import { LoginAclService } from './login-acl.service';

@ApiTags('ACL de login')
@ApiCookieAuth()
@Controller('login-acl')
export class LoginAclController {
  constructor(private readonly acl: LoginAclService) {}

  @Get()
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Regras de login por IP e horário, na ordem em que são avaliadas' })
  list() {
    return this.acl.list();
  }

  @Post()
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Cria uma regra (ex.: negar login fora da rede da faculdade à noite)' })
  create(@Body() body: unknown, @Req() req: Request) {
    const parsed = aclRuleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    return this.acl.create(parsed.data, currentUser(req).id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Remove uma regra; a auditoria guarda como ela era' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.acl.remove(id);
  }
}
