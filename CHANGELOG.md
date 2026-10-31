# Changelog

Todas as mudanças relevantes do DBWATCH são registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o versionamento segue o [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- **PK-10a · Cores, fontes e tema**
  - Direção visual "Radar": azul-petróleo no escuro e névoa verde-azulada no claro, com os dois temas conferidos em contraste AA.
  - Fontes Sora, IBM Plex Sans e IBM Plex Mono servidas pelo próprio app.
  - Tema claro, escuro ou do sistema, salvo no navegador e aplicado antes da primeira pintura (sem piscar).

- **PK-09b · Níveis de isolamento no laboratório**
  - Leitura não repetível (READ COMMITTED x REPEATABLE READ) e write skew (READ COMMITTED x SERIALIZABLE com `40001`), com os valores lidos em cada passo.
  - Scripts em `infra/lab/` para repetir os cinco cenários no `psql` com dois terminais; um teste executa os scripts para garantir que fazem o que prometem.

- **PK-09a · Laboratório de concorrência (LAB)**
  - Duas sessões reais do papel `dbwatch_lab` (isolado do produto) executam cenários passo a passo, com tempo e SQLSTATE de cada passo.
  - Cenários: transferência barrada pela CHECK com ROLLBACK, espera de lock e deadlock real.
  - Um experimento por vez (advisory lock), histórico em `lab.runs`, auditoria e chave `LAB_ENABLED`.

- **PK-08b · Eventos, alertas e SSE**
  - Cada rollback da API vira evento no monitor, com a operação, o SQLSTATE e o `correlation_id`.
  - Alertas gerados pelo coletor: lock acima de 5 s, transação parada acima de 30 s e deadlock novo, sem repetir o mesmo alerta; break-glass também gera alerta.
  - `GET /api/monitor/stream` (SSE): os eventos chegam ao vivo via `LISTEN/NOTIFY` do PostgreSQL, sem consultar a tabela a cada segundo.

- **PK-08a · Monitor: coletor e leitura**
  - Coletor com o papel `dbwatch_monitor` que grava, a cada 5 s e numa transação, amostras de `pg_stat_database`, `pg_stat_activity` e dos pares bloqueado/bloqueador (`pg_blocking_pids`), com BRIN e retenção de 7 dias.
  - O texto das queries nunca é gravado (só o comando, garantido também por CHECK).
  - `GET /api/monitor/overview`, `/locks` e `/series`, com taxas calculadas por `LAG()` e sem valores negativos quando os contadores zeram.

- **PK-07c · Break-glass**
  - Acesso de emergência do ADMIN: até 15 min, somente leitura, justificativa longa, sem aprovação prévia, auditado como alerta.
  - Fila e revisão posterior por outra pessoa; o banco garante permissão, prazo, justificativa e que pedido comum nasce pendente.

- **PK-07b · Consultas controladas**
  - Banco-alvo `dbwatch_target` com dados fictícios (`pnpm db:target`): produtos, clientes e pedidos.
  - Catálogo de consultas versionado por migration e `POST /api/queries/:code/execute`: só com concessão ativa, papel e transação somente leitura, tempo-limite e limite de linhas por consulta.
  - Cada execução fica registrada (`pam.query_executions`) e auditada; expirada, revogada ou sem concessão responde 403 com o motivo, e tempo-limite responde 504.

- **PK-07a · Meus acessos, revogação e expiração**
  - `GET /api/grants/mine` com estado calculado pelo relógio do banco, segundos restantes e aviso de expiração em 5 min.
  - `GET /api/grants/active` e `POST /api/grants/:id/revoke` (motivo obrigatório; já revogada ou vencida responde 409).
  - Job que registra cada expiração na auditoria uma única vez (`GRANT_SWEEP_SECONDS`), e RLS nas concessões.

- **PK-06c · Aprovação em 2 níveis e RLS**
  - Recursos HIGH exigem dois aprovadores diferentes; a concessão só nasce na segunda aprovação, e um trigger garante isso no banco.
  - Row Level Security em `pam.access_requests`: o banco só mostra, altera ou aceita pedidos de quem se declarou na transação.
  - `GET /api/requests/:id`: dono e aprovadores veem; os demais recebem 404.

- **PK-06b · Aprovar e rejeitar**
  - Aprovação com UPDATE condicional: com vários aprovadores ao mesmo tempo, só um vence e os outros recebem 409.
  - A concessão temporária nasce na mesma transação da aprovação; a `EXCLUDE` do banco impede duas concessões sobrepostas no tempo.
  - Rejeição com motivo obrigatório e cancelamento só pelo dono do pedido; ninguém decide o próprio pedido (API e CHECK do banco).
  - Deadlock e falha de serialização são refeitos automaticamente (até 3 tentativas), e só o resultado final entra na auditoria.

- **PK-06a · Recursos e pedidos de acesso**
  - Schema `pam` com recursos e pedidos; o banco garante justificativa de 20 a 500 caracteres, um pedido pendente por pessoa e recurso (UNIQUE parcial), duração dentro do máximo do recurso (trigger) e que ninguém decide o próprio pedido (CHECK).
  - `GET /api/resources`, `POST /api/requests`, `GET /api/requests/mine` e `GET /api/requests/queue`, com o pedido auditado.
  - Três recursos fictícios no `pnpm db:seed`.

- **PK-05d · ACL de login**
  - Regras de login por faixa de IP, usuário, dia da semana e horário, com prioridade, decididas por uma função do PostgreSQL e indexadas com GiST.
  - CHECKs no banco: faixa sem bits de host, janela válida e nenhuma regra que negue todos sempre.
  - `GET`, `POST` e `DELETE /api/login-acl`, com o antes e o depois na auditoria; login negado pela regra responde 403 e é auditado.

- **PK-05c · Sessões ativas**
  - Cada usuário vê as próprias sessões (com a atual marcada) e encerra as outras; sessão de outra pessoa responde 404.
  - O admin vê e encerra todas as sessões de um usuário, com a contagem registrada na auditoria.

- **PK-05b · Administração de usuários**
  - `GET /api/users`, `POST /api/users` (senha com 12+ caracteres, diferente do e-mail), `PATCH /api/users/:id/status`, `POST /api/users/:id/roles` e `DELETE /api/users/:id/roles/:role`.
  - Desativar revoga todas as sessões na mesma transação; a auditoria guarda o antes e o depois.
  - Trigger com advisory lock garante pelo menos um ADMIN ativo, mesmo com remoções simultâneas.
  - Erros do banco traduzidos para HTTP: e-mail repetido 409, autoatribuição de papel 403, último ADMIN 422.

- **PK-05a · Permissões por rota e rotas da auditoria**
  - Guard global que nega por padrão: toda rota declara `@Public()`, `@Authenticated()` ou `@RequirePermission(...)`, e um teste percorre todas as rotas para garantir isso.
  - Permissões lidas junto com a sessão a cada requisição; cada 403 é auditado como `authz.denied`.
  - `GET /api/audit` com filtros e paginação por cursor, e `GET /api/audit/verify`, que verifica a cadeia de hash e registra a própria verificação. Só o AUDITOR tem acesso (separação de funções).

- **PK-04 · Autenticação**
  - Login com Argon2id e sessão guardada no servidor (`iam.sessions`): o cookie `HttpOnly` e `SameSite=Strict` leva um token aleatório de 256 bits, e o banco guarda só o SHA-256 dele.
  - `POST /api/auth/login`, `POST /api/auth/logout` (revoga no banco) e `GET /api/auth/me` com papéis e permissões efetivas.
  - Expiração por 30 min de inatividade e 8 h absolutas; usuário desativado perde a sessão na hora.
  - Bloqueio após 5 falhas com contador atômico, rate limit por IP, mesma resposta e mesmo custo para e-mail inexistente; cada negação auditada com o motivo.
  - Guard global que nega por padrão (`@Public()` só no health e no login), verificação de `Origin` contra CSRF e cabeçalhos de segurança (CSP, `nosniff`, `X-Frame-Options`).
  - Swagger em `/api/docs`.
  - `pnpm db:seed`: cinco usuários de demonstração, um por papel, com senhas aleatórias mostradas só no terminal; o próprio seed é auditado.
  - Constraints em `iam.sessions` (hash de 32 bytes, período válido) e a API sem permissão de `DELETE` nas sessões.

- **PK-03 · Auditoria persistente**
  - Schema `audit` com `audit_log` append-only: triggers barram `UPDATE`, `DELETE` e `TRUNCATE` (até para o dono da tabela) e o papel da API só tem `INSERT` e `SELECT`.
  - Cadeia de hash SHA-256 serializada por advisory lock, com verificador (`audit.verify_chain()`) que aponta adulteração, linha apagada e buraco na numeração.
  - Índice BRIN por data, índices por ator e por `correlation_id`.
  - `AuditService` e `AuditedTransaction`: o sucesso é gravado na mesma transação da ação e a falha numa transação separada, sobrevivendo ao `ROLLBACK`; `application_name` identifica cada transação no PostgreSQL.
  - Prisma 7 com driver adapter (`@prisma/adapter-pg`) e cliente gerado fora do Git.
  - Página `/testes` com o resultado real da suíte (`pnpm test:report`) e testes unitários na web.

- **PK-02 · Banco base e papéis**
  - Cinco papéis do PostgreSQL com senha própria e menor privilégio (`dbwatch_migrator`, `dbwatch_app`, `dbwatch_monitor`, `dbwatch_lab`, `dbwatch_target_ro`), criados pelo mesmo script no Compose e no CI; banco-alvo `dbwatch_target` somente leitura.
  - Prisma 7.10.1 com a primeira migration do schema `iam`: usuários, papéis, permissões e associações, com índice único em `lower(email)`, CHECKs, FKs `RESTRICT`, bloqueio de autoatribuição de papel e catálogo de permissões versionado.
  - A API passa a se conectar com `dbwatch_app`.
  - Testes de banco que tentam violar cada regra e cada privilégio, e verificação de que o banco migrado bate com o `schema.prisma`.

- **PK-01 · Monorepo e ambiente local**
  - Monorepo com pnpm workspaces: `apps/api` (NestJS 12) e `apps/web` (Next.js 16), TypeScript 6 em modo `strict`.
  - Docker Compose com PostgreSQL 16 (desenvolvimento e testes), parâmetros de lock e deadlock ativados e portas presas a `127.0.0.1`.
  - API: validação das variáveis de ambiente na inicialização, `correlation_id` por requisição (`X-Request-Id`), filtro global de erros que não vaza detalhes internos, logs em JSON e `GET /api/health` com verificação real do banco (200/503).
  - Web: página inicial que mostra o estado real do banco via `/api` (mesma origem).
  - Testes com Vitest contra PostgreSQL real (8 testes), ESLint, Prettier e CI no GitHub Actions.

- **PK-00 · Descoberta e planejamento**
  - README com visão geral, arquitetura, segurança, monitor, laboratório, objetivo acadêmico, testes e roadmap.
  - Documentos de planejamento: PRD, ARCHITECTURE, DATA_MODEL, SECURITY, TEST_PLAN, ROADMAP, DECISIONS, DESIGN e DEMO.
  - Identidade visual: logo do suricato sentinela em vários tamanhos, paleta dos modos claro e escuro com contraste AA calculado e tipografia.
  - Validação do DDL principal (constraints, auditoria append-only, cadeia de hash e aprovação concorrente) num PostgreSQL 16.15 descartável.
  - `.gitignore` e `.editorconfig`.
