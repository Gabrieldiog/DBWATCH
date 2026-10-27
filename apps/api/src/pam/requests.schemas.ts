import { z } from 'zod';

// Estrito: status, decided_by ou id enviados pelo cliente viram 400, nunca são gravados
export const newRequestSchema = z
  .object({
    resourceId: z.uuid(),
    accessLevel: z.enum(['READ', 'WRITE']),
    requestedMinutes: z.number().int().min(5).max(480),
    justification: z.string().trim().min(20).max(500),
  })
  .strict();
export type NewRequest = z.infer<typeof newRequestSchema>;

export const decisionSchema = z.object({ note: z.string().trim().min(5).max(500).optional() }).strict();
