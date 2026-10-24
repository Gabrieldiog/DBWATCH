import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Origem do front: requisições que alteram estado vindas de outra origem são recusadas (CSRF)
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  API_DOCS: z.enum(['on', 'off']).default('on'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Mostra só o nome das variáveis inválidas, nunca os valores (podem conter senha)
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Configuração inválida: ${fields}`);
  }
  return parsed.data;
}
