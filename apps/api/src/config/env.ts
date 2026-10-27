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
  // Intervalo do job que audita expirações; 0 desliga (os testes chamam o job direto)
  // Banco-alvo das consultas controladas, com o papel somente leitura; sem ela, as consultas respondem 503
  TARGET_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  GRANT_SWEEP_SECONDS: z.coerce.number().int().min(0).default(30),
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
