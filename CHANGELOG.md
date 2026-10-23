# Changelog

Todas as mudanças relevantes do DBWATCH são registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o versionamento segue o [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

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
