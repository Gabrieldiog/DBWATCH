import { z } from 'zod';

// NIST 800-63B: comprimento mínimo em vez de regras de composição; senha igual ao e-mail é recusada
export const newUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(200),
  })
  .strict()
  .refine((u) => u.password.toLowerCase() !== u.email, { path: ['password'], message: 'A senha não pode ser o e-mail' });
export type NewUser = z.infer<typeof newUserSchema>;

export const statusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }).strict();
export const roleSchema = z.object({ role: z.enum(['ADMIN', 'APPROVER', 'REQUESTER', 'AUDITOR']) }).strict();
