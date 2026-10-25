import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário no formato HH:MM');

// O formato é checado aqui; as regras de negócio (faixa limpa, janela válida, não negar tudo) ficam nas CHECKs do banco
export const aclRuleSchema = z
  .object({
    priority: z.number().int().min(1).max(1000),
    action: z.enum(['ALLOW', 'DENY']),
    ipRange: z.string().max(43).optional(),
    userId: z.uuid().optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    description: z.string().trim().min(1).max(200),
  })
  .strict();
export type AclRule = z.infer<typeof aclRuleSchema>;
