import {
  BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { describeFailure, sqlStateOf } from '../audit/failure';

const BY_CONSTRAINT: Record<string, () => HttpException> = {
  user_roles_no_self_grant_ck: () => new ForbiddenException('Ninguém atribui papel a si mesmo'),
  login_acl_no_deny_all_ck: () => new BadRequestException('Uma regra não pode negar o login de todos, sempre'),
  login_acl_ip_range_ck: () => new BadRequestException('Faixa de IP com bits de host (use 10.0.0.0/8, não 10.0.0.1/8)'),
  login_acl_window_ck: () => new BadRequestException('O horário de início precisa ser antes do fim'),
};

// As regras vivem no banco; aqui só traduzimos o SQLSTATE para uma resposta HTTP clara
export function toHttpError(err: unknown, conflict = 'Registro já existe'): unknown {
  if (err instanceof HttpException) return err;
  const state = sqlStateOf(err);
  if (state === 'DW001') return new UnprocessableEntityException('O sistema precisa de pelo menos um ADMIN ativo');
  const constraint = /sqlstate:\w+ (\w+)/.exec(describeFailure(err).reason)?.[1];
  if (constraint && BY_CONSTRAINT[constraint]) return BY_CONSTRAINT[constraint]();
  if (state === '23505') return new ConflictException(conflict);
  if (state === '23503') return new NotFoundException('Usuário não encontrado');
  // 22P02 e 22007: texto que o banco não aceita como inet, uuid ou horário
  if (state === '23514' || state === '22P02' || state === '22007') return new BadRequestException('Dados inválidos');
  return err;
}
