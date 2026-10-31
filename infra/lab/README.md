# Laboratório no psql (LAB)

Os mesmos cenários do laboratório da API, para rodar na mão, com dois terminais lado a lado. Os dados são fictícios e ficam no schema `lab`, que o papel `dbwatch_lab` enxerga sozinho.

```bash
# Terminal A e terminal B (os dois iguais)
docker compose exec postgres psql -U dbwatch_lab -d dbwatch
```

1. Antes de cada cenário, volte os dados ao ponto inicial (num terceiro terminal, na raiz do projeto):
   `docker compose exec -T postgres psql -U dbwatch_lab -d dbwatch < infra/lab/00-preparar.sql`
2. Abra o cenário e siga os blocos na ordem. `-- [A] 3` significa "terminal A, passo 3".
3. Um bloco marcado **(fica esperando)** trava o terminal de propósito: siga para o próximo bloco no outro terminal.

| Script | O que mostrar | Resultado esperado |
| --- | --- | --- |
| `01-transferencia-falha.sql` | Atomicidade e CHECK | `ERROR 23514`; saldos voltam a 100 e 50 |
| `02-espera-de-lock.sql` | Lock de linha | B trava até o COMMIT de A; Ana termina com 70 |
| `03-deadlock.sql` | Deadlock | Em ~1 s, um terminal recebe `ERROR 40P01` |
| `04-leitura-nao-repetivel.sql` | READ COMMITTED x REPEATABLE READ | A leitura muda na primeira parte e não muda na segunda |
| `05-write-skew.sql` | Write skew e SERIALIZABLE | Parte 1 termina com 0 de plantão; parte 2 dá `ERROR 40001` e termina com 1 |

Um teste automatizado (`apps/api/test/lab/scripts.spec.ts`) executa estes arquivos bloco a bloco com duas conexões reais, para garantir que eles fazem exatamente o que está escrito aqui.
