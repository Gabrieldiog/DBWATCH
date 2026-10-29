import { SetMetadata } from '@nestjs/common';

// Espelha o catálogo iam.permissions; um teste garante que os dois não divergem
export const PERMISSIONS = [
  'request:create', 'request:read:own', 'request:review', 'grant:read:own', 'grant:revoke', 'query:execute',
  'user:manage', 'role:assign', 'audit:read', 'audit:verify', 'monitor:read', 'lab:run', 'breakglass:use',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const REQUIRED_PERMISSIONS = 'dbwatch:permissions';

// Exige sessão e todas as permissões listadas
export const RequirePermission = (...codes: [Permission, ...Permission[]]) => SetMetadata(REQUIRED_PERMISSIONS, codes);

// Exige só a sessão (ex.: /me e logout); declarar isso é obrigatório, o silêncio nega
export const Authenticated = () => SetMetadata(REQUIRED_PERMISSIONS, []);
