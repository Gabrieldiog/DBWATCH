# Registro de decisões arquiteturais (ADR)

Formato curto: **contexto → decisão → alternativas → consequências**. Status possíveis: *Proposta*, *Aceita*, *Substituída*.

Todas as decisões abaixo estão como **Proposta** até a aprovação do planejamento (PK-00).

| ADR | Decisão | Status |
| --- | --- | --- |
| 001 | Monorepo com pnpm workspaces, sem Turborepo | Proposta |
| 002 | NestJS na API | Proposta |
| 003 | Next.js (App Router) na interface | Proposta |
| 004 | PostgreSQL 16 + Prisma estável + `pg` para SQL explícito | Proposta |
| 005 | Sessões no servidor em vez de JWT | Proposta |
| 006 | Argon2id para senhas | Proposta |
| 007 | Zod como contrato único entre web e API | Proposta |
| 008 | Mesma origem via proxy reverso | Proposta |
| 009 | Auditoria append-only com cadeia de hash serializada por advisory lock | Proposta |
| 010 | Estado da concessão calculado pelo tempo | Proposta |
| 011 | Catálogo de consultas em vez de SQL livre ou credenciais efêmeras | Proposta |
| 012 | Monitor por amostragem, sem guardar o texto das queries | Proposta |
| 013 | Laboratório com conexões dedicadas e papel isolado | Proposta |
| 014 | Vitest + PostgreSQL real via Compose nos testes | Proposta |
| 015 | SSE para tempo real | Proposta |
| 016 | Tailwind + Radix primitives + Motion na interface | Proposta |
| 017 | Tipografia: Sora + IBM Plex Sans + IBM Plex Mono | Proposta |
| 018 | Somente versões estáveis, fixadas no lockfile | Proposta |

---

### ADR-001 · Monorepo com pnpm workspaces

- **Contexto:** web e API compartilham contratos; uma equipe pequena precisa de um único lugar para rodar tudo.
- **Decisão:** um repositório com `apps/api`, `apps/web` e `packages/contracts`, gerenciados por **pnpm workspaces** (pnpm 10 já disponível no ambiente).
- **Alternativas:** repositórios separados (contratos duplicados e versionamento cruzado); Turborepo ou Nx (cache de build útil em projetos grandes, mas uma ferramenta a mais para aprender e configurar em 20 dias).
- **Consequências:** scripts com `pnpm -r` / `pnpm --filter`. Se o build ficar lento, adicionar o Turborepo depois é simples.

### ADR-002 · NestJS na API

- **Contexto:** a API é a fronteira de segurança e o centro acadêmico do projeto.
- **Decisão:** **NestJS** com TypeScript `strict`.
- **Alternativas:** Express ou Fastify puro (menos estrutura; guards e pipes teriam de ser reinventados); rotas de API do Next.js (misturaria a fronteira de segurança com a interface).
- **Consequências:** guards globais (nega por padrão), pipes de validação e módulos com fronteiras claras. Custo: decorators e injeção de dependência exigem atenção na configuração do TypeScript (ver ADR-018).

### ADR-003 · Next.js (App Router)

- **Decisão:** **Next.js** com App Router, Server Components para leitura e Client Components para interação e animação.
- **Alternativas:** Vite + React SPA (mais simples, mas sem SSR nem layouts aninhados; sem diferença real de segurança).
- **Consequências:** fontes servidas localmente com `next/font`, *rewrite* de `/api` em desenvolvimento e build `standalone` para a VPS.

### ADR-004 · PostgreSQL 16 + Prisma + `pg`

- **Contexto:** a disciplina exige mostrar transações, isolamento, locks e constraints avançadas, mas o CRUD comum não deveria custar tempo.
- **Decisão:** **Prisma** para schema, migrations e CRUD tipado; **`pg`** para o que precisa de controle explícito (laboratório com conexões dedicadas, coletor do monitor, `FOR UPDATE`, consultas no banco-alvo). SQL escrito à mão dentro das migrations para CHECK, EXCLUDE, índices parciais, triggers, grants e RLS.
- **Alternativas:** só Prisma (esconde conexões e não permite controlar duas sessões no laboratório); só SQL com `pg` (sem migrations versionadas nem tipagem: mais código e mais risco); TypeORM ou Drizzle (viáveis, mas o Prisma tem o fluxo de migrations mais simples de explicar).
- **Consequências:** duas formas de acesso ao banco, com regra clara de quando usar cada uma. O SQL explícito é **sempre parametrizado**.

### ADR-005 · Sessões no servidor

- **Contexto:** num PAM, revogar precisa ter efeito imediato.
- **Decisão:** token opaco aleatório num cookie `HttpOnly`; o banco guarda `sha256(token)`.
- **Alternativas:** JWT (sem consulta ao banco por requisição, mas a revogação só vale na expiração ou exige uma *denylist*, que é uma sessão disfarçada).
- **Consequências:** uma consulta indexada por requisição (barata). A revogação é imediata, e as sessões ativas viram dado auditável.

### ADR-006 · Argon2id

- **Decisão:** **Argon2id** (pacote `argon2`, com binários pré-compilados), nos parâmetros do OWASP.
- **Alternativas:** `scrypt` nativo do Node (zero dependências e aceito pelo OWASP como segunda opção); bcrypt (limite de 72 bytes e mais antigo).
- **Consequências:** uma dependência nativa. Se o build na VPS falhar, o plano B é o `scrypt` nativo, com o algoritmo registrado no próprio hash para migrar depois.

### ADR-007 · Zod como contrato único

- **Decisão:** schemas Zod em `packages/contracts`, usados por um `ZodValidationPipe` na API e pelos formulários na web.
- **Alternativas:** `class-validator` (padrão do Nest, mas duplicaria os schemas no front).
- **Consequências:** uma fonte de verdade para formatos e limites. Os schemas de entrada são `.strict()` (bloqueiam *mass assignment*).

### ADR-008 · Mesma origem via proxy reverso

- **Decisão:** **Caddy** na VPS (HTTPS automático) servindo `/` → web e `/api` → API; *rewrite* equivalente no Next.js em desenvolvimento.
- **Alternativas:** domínios separados com CORS (exige `SameSite=None` e proteção extra contra CSRF); Nginx (exige configurar os certificados à mão).
- **Consequências:** cookie `SameSite=Strict`, nenhuma configuração de CORS e uma superfície menor.

### ADR-009 · Auditoria append-only com cadeia de hash

- **Decisão:** grants mínimos + triggers que bloqueiam `UPDATE`/`DELETE`/`TRUNCATE` + cadeia SHA-256 calculada num trigger `BEFORE INSERT`, serializada por `pg_advisory_xact_lock` e ordenada por `chain_position`. Exige `READ COMMITTED`.
- **Alternativas:** só grants (não detecta superusuário); assinatura por linha na aplicação (a chave estaria no mesmo servidor); serviço externo de log imutável (fora do escopo).
- **Consequências:** as inserções na auditoria são serializadas, o que é aceitável no volume do MVP e documentado. O hash usa o *epoch* do horário para não depender do fuso da sessão. **Validado em PostgreSQL 16.15** (ver [DATA_MODEL](DATA_MODEL.md)).

### ADR-010 · Estado da concessão calculado pelo tempo

- **Decisão:** `ACTIVE`, `EXPIRED` e `REVOKED` são derivados de `starts_at`, `expires_at` e `revoked_at` no momento da consulta.
- **Alternativas:** coluna `status` atualizada por um job (se o job parar, o acesso não expira, o que é um risco direto de segurança).
- **Consequências:** a expiração é sempre correta. O job existe só para registrar `grant.expired` na auditoria.

### ADR-011 · Catálogo de consultas

- **Decisão:** com uma concessão ativa, o usuário executa **templates parametrizados** versionados por migration, em transação somente leitura, com papel somente leitura, tempo-limite e limite de linhas.
- **Alternativas:** editor de SQL livre (inseguro, contraria o próprio PAM); credenciais efêmeras com `CREATE ROLE … VALID UNTIL` (mais fiel a um PAM real, mas exige `CREATEROLE` para a API; fica como evolução).
- **Consequências:** o uso fica restrito ao catálogo, o que é suficiente para demonstrar o ciclo completo do acesso privilegiado com risco controlado.

### ADR-012 · Monitor por amostragem

- **Decisão:** um coletor lê as views `pg_stat_*` a cada 5 s com um papel membro de `pg_monitor` e grava amostras próprias; as taxas são calculadas com `LAG()`. O texto das queries não é gravado.
- **Alternativas:** ler o log do servidor (exige acesso ao sistema de arquivos e *parsing*); extensões como `pg_stat_statements` e `auto_explain` (ficam opcionais); ferramentas externas como Prometheus e Grafana (fora do escopo; esconderiam o SQL que queremos mostrar).
- **Consequências:** eventos mais curtos que o intervalo podem passar despercebidos (documentado em ARCHITECTURE §4.2).

### ADR-013 · Laboratório isolado

- **Decisão:** um schema `lab`, um papel `dbwatch_lab` com timeouts definidos por `ALTER ROLE`, duas conexões dedicadas, um experimento por vez (advisory lock) e ativação por `LAB_ENABLED`.
- **Consequências:** os experimentos são reais (não simulados) e não afetam os dados do produto.

### ADR-014 · Vitest + PostgreSQL real via Compose

- **Decisão:** **Vitest** em toda a monorepo (com SWC para os decorators do Nest); um serviço `postgres-test` com `tmpfs` no Compose e no CI.
- **Alternativas:** Jest (padrão do Nest, mais lento e com configuração ESM mais chata); Testcontainers (excelente isolamento, mas uma dependência a mais quando o Compose já resolve).
- **Consequências:** um único runner. *Hipótese a validar no PK-01:* integração do Vitest com o Nest via SWC. Plano B: Jest só na API.

### ADR-015 · SSE para tempo real

- **Decisão:** Server-Sent Events (suportado nativamente pelo Nest com `@Sse`) para o monitor e o laboratório.
- **Alternativas:** WebSocket (bidirecional, desnecessário aqui); polling (mais simples, mas com mais carga e menos fluidez nas animações).
- **Consequências:** nenhuma dependência nova. Funciona através do Caddy e reconecta sozinho.

### ADR-016 · Tailwind + Radix primitives + Motion

- **Decisão:** Tailwind com tokens próprios (CSS variables) para os temas; Radix primitives **só** para componentes com acessibilidade difícil (diálogo, menu, abas, tooltip); **Motion** para animações com significado.
- **Alternativas:** um kit visual pronto (deixaria a interface com cara de template, que é o oposto da identidade buscada); CSS puro para animações complexas (como a coreografia do grafo de locks).
- **Consequências:** uma identidade própria, sem abrir mão de acessibilidade. Toda animação respeita `prefers-reduced-motion`.

### ADR-017 · Tipografia

- **Decisão:** **Sora** em títulos e números de destaque; **IBM Plex Sans** no texto e na interface; **IBM Plex Mono** em SQL, IDs e hashes. Fontes servidas localmente com `next/font`, sem chamadas a servidores externos em tempo de execução.
- **Motivo:** legibilidade no projetor (Plex foi desenhada para interfaces técnicas), personalidade geométrica nos títulos (Sora combina com o radar da logo) e uma família mono da mesma origem do texto.
- Detalhes em [DESIGN.md](DESIGN.md).

### ADR-018 · Somente versões estáveis

- **Contexto:** em 22/10/2026, a *dist-tag* `latest` do pacote `prisma` no npm apontava para uma versão **RC** (`8.0.0-rc.24`), enquanto o `@prisma/client` estável estava na linha 7.x. O TypeScript `latest` era a 7.0, uma geração nova do compilador.
- **Decisão:** fixar no lockfile **apenas versões estáveis e compatíveis entre si**, escolhidas no PK-01 a partir das matrizes oficiais de compatibilidade (NestJS × TypeScript × Prisma). Nada de `latest`, `^` em pacotes críticos ou versões RC.
- **Consequências:** atualizações viram decisões explícitas. Um spike no PK-01 valida a combinação antes de qualquer código de negócio.
