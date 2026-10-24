# Plano de testes

> Status: **proposta para aprovação** (PK-00). Os IDs abaixo são referenciados no [PRD](PRD.md), em [SECURITY.md](SECURITY.md) e no [ROADMAP](ROADMAP.md).

## 1. Estratégia

**Regra de ouro:** tudo o que envolve persistência é testado contra um **PostgreSQL 16 real**. Mocks de banco não reproduzem constraints, triggers, locks, isolamento nem RLS, que são justamente o que este projeto precisa provar.

| Camada | Ferramenta | Roda contra | Quando roda |
| --- | --- | --- | --- |
| Unidade | Vitest | Funções puras e serviços com dependências falsas | A cada commit (CI) |
| Banco | Vitest + `pg` | PostgreSQL real (serviço `postgres-test` com `tmpfs`) | A cada commit (CI) |
| Integração | Vitest + Supertest + app Nest real | API + PostgreSQL real | A cada commit (CI) |
| Segurança | Vitest (integração) | API + PostgreSQL real | A cada commit (CI) |
| Concorrência | Vitest + várias conexões `pg` | PostgreSQL real | A cada commit (CI) |
| E2E | Playwright (Chromium) | Sistema completo | Em PR e antes de release |
| Acessibilidade | `@axe-core/playwright` | Telas principais, nos modos claro e escuro | Em PR e antes de release |
| Exploratório | Navegador real com gravação de vídeo | Ambiente local e VPS | Ao fim dos packs de interface e no PK-13 |

### Convenções

- `*.unit.spec.ts`: testes unitários, sem banco de dados.
- `test/db/`: testes que falam direto com o PostgreSQL usando cada papel (`dbwatch_app`, `dbwatch_monitor`…).
- Os demais `*.spec.ts`: integração (Nest + Prisma + PostgreSQL real).
- `pnpm test:report` gera o relatório exibido na página `/testes`.

### Isolamento entre testes

- Testes de banco e de integração rodam num **banco recriado a cada execução da suíte**, com migrations aplicadas do zero (o que também testa as migrations).
- Cada arquivo de teste usa dados próprios (e-mails e IDs gerados) para poder rodar em paralelo.
- **A auditoria não pode ser truncada** (é append-only!). Por isso os testes não limpam tabelas: o banco inteiro é descartado no fim.
- Testes de concorrência usam conexões dedicadas, com `lock_timeout` curto, para nunca travar a suíte.

### Metas de cobertura

| Área | Meta de linhas | Motivo |
| --- | --- | --- |
| `auth`, `iam`, `pam`, `audit` (serviços e guards) | ≥ 90% | São a fronteira de segurança |
| Restante da API | ≥ 75% | — |
| Web | Fluxos críticos cobertos por E2E | Cobertura de linhas no front tem pouco valor aqui |

Cobertura não substitui casos de borda: **todo controle de segurança precisa de um teste negativo** (que tenta burlar o controle e espera falha).

## 2. Casos de teste

### Banco (T-DB): cada regra é testada tentando violá-la

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| T-DB-01 | Inserir `ana@x.com` e depois `ANA@X.com` | `23505` em `users_email_lower_uk` |
| T-DB-02 | Apagar um usuário que tem registros de auditoria ou pedidos | `23503` (FK `RESTRICT`) |
| T-DB-03 | Gravar `decided_by = requester_id` direto no banco | `23514` em `access_requests_sod_ck` |
| T-DB-04 | Dois pedidos `PENDING` para o mesmo usuário e recurso | `23505` no índice único parcial; com um deles `REJECTED`, o novo é aceito |
| T-DB-05 | Concessões sobrepostas para o mesmo usuário e recurso; depois, sobrepostas com uma revogada | `23P01` no primeiro caso; aceita no segundo |
| T-DB-06 | Concessão com `expires_at <= starts_at` | `23514` |
| T-DB-07 | `UPDATE` na auditoria com o papel dono | Exceção do trigger (`42501`) |
| T-DB-08 | `TRUNCATE` na auditoria | Exceção do trigger |
| T-DB-09 | `DELETE`/`UPDATE` na auditoria com `dbwatch_app` | `permission denied` |
| T-DB-10 | Inserir N registros, adulterar o registro k como superusuário e chamar a verificação | A verificação aponta exatamente a posição k, inclusive com outro `TimeZone` na sessão |
| T-DB-11 | (a) Inserir na auditoria em `REPEATABLE READ`; (b) 20 inserções concorrentes em 4 conexões | (a) recusada; (b) `chain_position` de 1 a N sem buracos e cadeia íntegra |
| T-DB-12 | Para cada papel do banco, tentar cada operação proibida da tabela de papéis do [DATA_MODEL](DATA_MODEL.md#5-papéis-do-banco-menor-privilégio) | Todas negadas |
| T-MIG-01 | Banco vazio → `migrate deploy` → `migrate diff` | Diff vazio; nenhuma migration editada depois de mesclada (verificação por hash no CI) |

### Autenticação (T-AUTH)

| ID | Cenário | Esperado |
| --- | --- | --- |
| T-AUTH-01 | Login válido | 200; cookie com `HttpOnly`, `Secure`, `SameSite=Strict`; sessão no banco guarda só o hash; auditoria `auth.login` |
| T-AUTH-02 | Senha errada | 401 genérico; `failed_login_count` incrementado; auditoria `DENIED` |
| T-AUTH-03 | 5 falhas seguidas e depois a senha correta | 423 até `locked_until`; depois, login permitido |
| T-AUTH-04 | 10 logins errados em paralelo para a mesma conta | O contador termina exatamente em 10 (incremento atômico, sem *lost update*) |
| T-AUTH-05 | Login com e-mail inexistente | Mesma resposta e tempo equivalente (± 20%) ao de uma senha errada |
| T-AUTH-06 | Sessão expirada por inatividade, por tempo absoluto e revogada | 401 nos três casos |
| T-AUTH-07 | Cookie de sessão definido antes do login | Ignorado; um novo token é emitido |
| T-AUTH-08 | Varredura dos logs após o fluxo completo | Nenhuma ocorrência de senha, token ou cookie |

### Segurança e autorização (T-SEC)

| ID | Cenário | Esperado |
| --- | --- | --- |
| T-SEC-01 | Percorrer **todas** as rotas registradas no Nest | Cada uma tem `@RequirePermission` ou `@Public`; caso contrário, o teste falha |
| T-SEC-02 | Matriz rota × papel (incluindo anônimo) | 200/201, 401 ou 403 exatamente como a tabela de permissões |
| T-SEC-03 | O usuário A busca o pedido do usuário B pelo ID | 404 (não revela existência); com o filtro do serviço removido de propósito num teste, a RLS ainda bloqueia |
| T-SEC-04 | `POST` com `Origin` de outro site | 403 |
| T-SEC-05 | Criar um pedido enviando `status`, `decided_by` ou `id` | 400 (schema estrito) |
| T-SEC-06 | Payloads de injeção (`' OR 1=1 --`, `"; DROP TABLE`…) nos filtros da auditoria e nos parâmetros de consultas | Tratados como valor; nenhum erro de sintaxe SQL; nenhuma linha a mais |
| T-SEC-07 | Cabeçalhos de segurança nas respostas | CSP, `nosniff`, `Referrer-Policy` e `frame-ancestors` presentes |
| T-SEC-08 | Forçar um erro interno | Resposta sem stack trace nem SQL; contém o `correlation_id` |

### IAM (T-IAM)

| ID | Cenário | Esperado |
| --- | --- | --- |
| T-IAM-01 | Criar um usuário com e-mail já existente | 409 |
| T-IAM-02 | Desativar um usuário com 3 sessões ativas | As 3 revogadas na mesma transação; a próxima requisição recebe 401 |
| T-IAM-03 | Remover o papel do último ADMIN ativo | 422 |
| T-IAM-04 | Dois admins removendo o papel um do outro ao mesmo tempo (eram os dois últimos) | Pelo menos um ADMIN continua (lock da verificação) |
| T-IAM-05 | Atribuir um papel | Auditoria com quem atribuiu, a quem e qual papel |

### PAM (T-PAM) e concorrência (T-CONC)

| ID | Cenário | Esperado |
| --- | --- | --- |
| T-PAM-01 | Criar um pedido válido | 201, `PENDING`, auditado |
| T-PAM-02 | Justificativa curta ou duração acima do máximo | 400 ou 422 |
| T-PAM-03 | O aprovador aprova o próprio pedido pela API | 403, auditado como `DENIED` |
| T-PAM-04 | Usuário com ADMIN e APPROVER aprova o próprio pedido | 403 |
| T-PAM-05 | Aprovar um pedido já rejeitado | 409 |
| T-PAM-06 | Aprovação | O pedido vira `APPROVED` e a concessão é criada na **mesma** transação (falha simulada na concessão → nada muda) |
| T-PAM-07 | Executar uma consulta depois de `expires_at` | 403, auditado com `grant_expired` |
| T-PAM-08 | Revogar e executar em seguida | 403 |
| T-PAM-09 | Template que dorme além do `statement_timeout` | Erro `57014` registrado; resposta 504 |
| T-PAM-10 | Concessão READ executando um template WRITE | 403 |
| T-CONC-01 | 10 aprovações simultâneas do mesmo pedido, por aprovadores diferentes | Exatamente 1 sucesso e 9 respostas 409; exatamente 1 concessão |

### Integração (T-INT)

| ID | Cenário | Esperado |
| --- | --- | --- |
| T-INT-01 | `GET /api/health` com o banco no ar e fora do ar | 200 / 503 |
| T-INT-08 | Ação bem-sucedida | O registro de auditoria compartilha a transação: se a ação sofrer rollback, o registro de sucesso também some |
| T-INT-09 | Ação que falha e sofre rollback | O registro `FAILURE` persiste (gravado fora da transação) com o mesmo `correlation_id` |

### Monitor (T-MON) e laboratório (T-LAB)

| ID | Cenário | Esperado |
| --- | --- | --- |
| T-MON-01 | Provocar um lock wait com duas conexões | Aparece em `lock_samples` com o par bloqueado/bloqueador correto |
| T-MON-02 | Provocar um deadlock | O delta de `deadlocks` em `db_samples` é ≥ 1 no intervalo |
| T-MON-03 | Rollback na API | `app_events` com `TX_ROLLBACK`, a operação e o SQLSTATE |
| T-MON-04 | Executar uma query com literal "segredo-123" e coletar | A string não aparece em nenhuma tabela do monitor |
| T-MON-05 | Reiniciar o PostgreSQL (zerando os contadores) | Nenhum delta negativo nas taxas |
| T-LAB-01 | Transferência com falha | Saldos iguais aos de antes; SQLSTATE `23514` registrado |
| T-LAB-02 | Lock wait | B espera até A confirmar; o tempo de espera é registrado |
| T-LAB-03 | Deadlock | Exatamente uma sessão recebe `40P01`; a outra confirma |
| T-LAB-04 | Leitura não repetível | Valores diferentes em `READ COMMITTED`, iguais em `REPEATABLE READ` |
| T-LAB-05 | Write skew | Em `READ COMMITTED` a invariante quebra; em `SERIALIZABLE` uma sessão recebe `40001` |
| T-LAB-06 | Isolamento do lab | `dbwatch_lab` não lê `iam`/`audit`; um segundo experimento simultâneo recebe 409; nenhuma transação passa dos timeouts |

### E2E (T-E2E) e acessibilidade (T-A11Y)

| ID | Fluxo |
| --- | --- |
| T-E2E-01 | Login, logout, sessão expirada redireciona para o login com aviso |
| T-E2E-02 | Solicitante pede → aprovador aprova → solicitante vê a concessão com contagem regressiva |
| T-E2E-03 | Solicitante executa uma consulta do catálogo e vê o resultado |
| T-E2E-04 | Auditora filtra pelo `correlation_id` do fluxo anterior e verifica a integridade |
| T-E2E-05 | Admin executa o cenário de deadlock e vê a linha do tempo com o resultado |
| T-E2E-06 | Usuário sem permissão acessa `/admin` pela URL → tela "sem permissão" (e a API devolve 403) |
| T-A11Y-01 | axe nas telas login, dashboard, pedidos, aprovação, auditoria, monitor e lab, nos dois temas: zero violações *serious* ou *critical* |

## 3. Critérios de QA por pack

Ao fim de cada pack, antes de declarar concluído:

1. `pnpm lint` e `pnpm typecheck` sem erros.
2. Testes do pack e de regressão verdes.
3. Migrations aplicadas do zero e `migrate diff` vazio.
4. Revisão de segurança do diff (permissões, entradas, logs, segredos).
5. Para packs de interface: verificação visual nos dois temas e checagem do axe.
6. Comandos executados e resultados **reais** anotados na descrição do PR.

## 4. Fora do escopo de testes

- Testes de carga em escala de produção (apenas a carga leve de concorrência do T-CONC-01).
- Testes de penetração externos.
- Compatibilidade com navegadores antigos (o alvo são Chromium, Firefox e Safari atuais).
