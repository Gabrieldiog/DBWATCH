import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'dbwatch:public';
// Rotas são privadas por padrão; só o que tiver @Public() responde sem sessão
export const Public = () => SetMetadata(IS_PUBLIC, true);
