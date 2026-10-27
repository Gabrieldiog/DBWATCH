import { applyTargetSchema } from './database/target-schema';

// Uso: pnpm db:target (depois do docker compose up)
const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) throw new Error('Defina MIGRATOR_DATABASE_URL');
applyTargetSchema(url).then(
  () => console.log('Banco-alvo dbwatch_target pronto (dados fictícios).'),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
