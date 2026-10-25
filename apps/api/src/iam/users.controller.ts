import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { z } from 'zod';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { newUserSchema, roleSchema, statusSchema } from './users.schemas';
import { UsersService } from './users.service';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

@ApiTags('Usuários')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Lista os usuários com status e papéis (sem hash de senha)' })
  list() {
    return this.users.list();
  }

  @Post()
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Cria um usuário (senha com pelo menos 12 caracteres)' })
  create(@Body() body: unknown) {
    return this.users.create(parse(newUserSchema, body));
  }

  @Patch(':id/status')
  @RequirePermission('user:manage')
  @ApiOperation({ summary: 'Ativa ou desativa; desativar revoga todas as sessões na mesma transação' })
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.users.setStatus(id, parse(statusSchema, body).status);
  }

  @Post(':id/roles')
  @HttpCode(204)
  @RequirePermission('role:assign')
  @ApiOperation({ summary: 'Atribui um papel (ninguém atribui papel a si mesmo)' })
  async assignRole(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: Request) {
    await this.users.assignRole(id, parse(roleSchema, body).role, currentUser(req).id);
  }

  @Delete(':id/roles/:role')
  @HttpCode(204)
  @RequirePermission('role:assign')
  @ApiOperation({ summary: 'Remove um papel; o último ADMIN ativo não pode ser removido' })
  async removeRole(@Param('id', ParseUUIDPipe) id: string, @Param('role') role: string) {
    await this.users.removeRole(id, parse(roleSchema, { role }).role);
  }
}
