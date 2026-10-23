# Changelog

Todas as mudanças relevantes do DBWATCH são registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o versionamento segue o [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

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
