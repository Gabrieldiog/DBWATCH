# Changelog

Todas as mudanças relevantes do DBWATCH são registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o versionamento segue o [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

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
