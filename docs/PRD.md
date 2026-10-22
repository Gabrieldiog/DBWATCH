# PRD: Product Requirements Document

> Status: **proposta para aprovação** (PK-00). Versão 0.1, de 22/10/2026.

## 1. Problema

Em muitas equipes, o acesso privilegiado a bancos de dados é:

- **permanente:** quem recebeu acesso para resolver um incidente continua com ele meses depois;
- **compartilhado:** vários usam o mesmo usuário `postgres`, e ninguém sabe quem fez o quê;
- **sem rastro:** não existe registro confiável de quem pediu, quem autorizou e o que foi feito;
- **cego para o banco:** quando um lock trava a aplicação ou um deadlock derruba uma transação, ninguém liga o problema à pessoa ou à operação que o causou.

## 2. Proposta

O **DBWATCH** une três capacidades:

1. **PAM:** acesso temporário, justificado e aprovado por outra pessoa, com expiração automática.
2. **Database Monitor:** visão das sessões, transações, locks e deadlocks do PostgreSQL, separando o que foi observado no banco do que foi registrado pela aplicação.
3. **Auditoria protegida:** histórico append-only e verificável de toda ação.

## 3. Personas

| Persona | Papel no sistema | O que precisa |
| --- | --- | --- |
| **Diego, desenvolvedor** | REQUESTER | Pedir acesso de leitura rapidamente durante um incidente e saber quando foi aprovado |
| **Bruno, DBA líder** | APPROVER | Ver a fila de pedidos com contexto, aprovar ou rejeitar com motivo, revogar acessos e acompanhar locks |
| **Ana, administradora** | ADMIN | Cadastrar usuários e papéis e rodar o laboratório |
| **Eva, auditora** | AUDITOR | Responder "quem acessou o quê, quando e com autorização de quem" e provar que a trilha não foi alterada |
| **Professores avaliadores** | Público da demo | Ver conceitos de persistência acontecendo de verdade, de forma clara e reproduzível |

## 4. Objetivos e não objetivos

### Objetivos do MVP

- **O-1** Fluxo PAM completo: pedir → aprovar ou rejeitar → concessão temporária → uso controlado → expiração ou revogação.
- **O-2** Auditoria de 100% das ações de PAM, autenticação e administração, com verificação de integridade.
- **O-3** Monitor com sessões, cadeia de bloqueios, commits × rollbacks e deadlocks, com a fonte de cada dado identificada.
- **O-4** Laboratório com seis cenários reproduzíveis (rollback, lock wait, deadlock, leitura não repetível, write skew, índices).
- **O-5** Interface bonita, acessível, em modo claro e escuro, que funcione no projetor.
- **O-6** Suíte de testes que prove as regras de integridade e de segurança.

### Não objetivos (fora do MVP)

- Proxy de protocolo PostgreSQL ou gravação de sessões interativas (como em PAMs comerciais).
- Cofre de senhas e rotação de credenciais de servidores reais.
- SSO, LDAP ou MFA.
- Bancos que não sejam PostgreSQL.
- Alta disponibilidade, multi-tenant e escala horizontal.
- Execução de SQL arbitrário digitado pelo usuário.

## 5. Especificação das funcionalidades

Cada funcionalidade lista problema, usuário, regras, fluxo, erros, segurança, persistência, critérios de aceite e testes. Os IDs de teste estão em [TEST_PLAN.md](TEST_PLAN.md).

### F1. Autenticação (PK-04)

| | |
| --- | --- |
| **Problema** | Garantir que cada ação tenha um autor identificado |
| **Usuários** | Todos |
| **Regras** | Login por e-mail (sem diferenciar maiúsculas) e senha; 5 falhas seguidas bloqueiam a conta por 15 min; usuário `DISABLED` não entra; sessão expira com 30 min de inatividade ou 8 h no total |
| **Fluxo** | Formulário → `POST /api/auth/login` → cookie de sessão → redirecionamento para o dashboard. Logout com `POST /api/auth/logout` |
| **Erros** | Credenciais inválidas (401, mensagem genérica) · conta bloqueada (423, sem revelar se a senha estava certa) · excesso de tentativas por IP (429) |
| **Segurança** | Argon2id; cookie `HttpOnly`/`Secure`/`SameSite=Strict`; tempo de resposta equivalente para usuário inexistente; verificação de `Origin` |
| **Persistência** | `iam.users` (contador e bloqueio, `UPDATE` atômico), `iam.sessions` (hash do token), auditoria `auth.login`, `auth.login_failed`, `auth.locked`, `auth.logout` |
| **Aceite** | ✔ Login válido cria uma sessão e um registro de auditoria. ✔ A 5ª falha bloqueia, e a 6ª tentativa com a senha certa é recusada até o fim do bloqueio. ✔ Uma sessão revogada é recusada na requisição seguinte. ✔ O token não aparece em nenhum log |
| **Testes** | T-AUTH-01 a T-AUTH-08 |

### F2. Usuários, papéis e permissões (PK-05)

| | |
| --- | --- |
| **Problema** | Dar a cada pessoa apenas o necessário |
| **Usuários** | ADMIN |
| **Regras** | Usuários são desativados, nunca apagados; um usuário não pode remover o próprio papel `ADMIN` se for o último administrador ativo; toda mudança de papel é auditada com quem fez |
| **Fluxo** | Lista de usuários → criar (senha temporária exibida uma vez) → atribuir ou remover papéis → desativar |
| **Erros** | E-mail já usado (409) · remover o último ADMIN (422) · sem permissão (403) |
| **Segurança** | Guard global que nega por padrão; matriz de autorização testada; a criação não aceita campos extras |
| **Persistência** | `iam.users`, `iam.roles`, `iam.permissions`, `iam.user_roles`, `iam.role_permissions`; desativar revoga as sessões na mesma transação |
| **Aceite** | ✔ Uma rota sem permissão declarada responde 403 (teste automático percorre todas). ✔ Desativar encerra as sessões ativas imediatamente. ✔ "Último ADMIN" é protegido mesmo com duas requisições simultâneas |
| **Testes** | T-SEC-01, T-SEC-02, T-IAM-01 a T-IAM-05 |

### F3. Solicitação e aprovação de acesso (PK-06)

| | |
| --- | --- |
| **Problema** | Substituir acessos permanentes por pedidos justificados e aprovados |
| **Usuários** | REQUESTER (pede), APPROVER (decide) |
| **Regras** | Justificativa de 20 a 500 caracteres; duração de 5 min até o máximo do recurso; um pedido pendente por usuário e recurso; **quem pede não aprova**; a decisão é final; o solicitante pode cancelar enquanto o pedido estiver pendente |
| **Fluxo** | Solicitante escolhe o recurso, o nível (READ/WRITE), a duração e a justificativa → pedido `PENDING` → aprovador vê a fila → aprova (gera concessão) ou rejeita (com motivo obrigatório) |
| **Erros** | Autoaprovação (403 na API; `23514` no banco) · pedido já decidido (409) · pedido pendente duplicado (409) · recurso inativo (422) · duração acima do máximo (422) |
| **Segurança** | O solicitante só vê os próprios pedidos (verificação de dono + RLS); campos de decisão não são aceitos na criação |
| **Persistência** | `pam.access_requests` com CHECKs e UNIQUE parcial; aprovação e criação da concessão **na mesma transação**; `UPDATE … WHERE status = 'PENDING'` para concorrência |
| **Aceite** | ✔ Dois aprovadores simultâneos: exatamente um sucesso e uma concessão. ✔ Autoaprovação recusada mesmo inserindo direto no banco. ✔ Toda decisão aparece na auditoria com o mesmo `correlation_id` da requisição |
| **Testes** | T-PAM-01 a T-PAM-06, T-CONC-01 |

### F4. Concessões temporárias (PK-07)

| | |
| --- | --- |
| **Problema** | Garantir que o acesso termine sozinho |
| **Usuários** | Solicitante (usa), APPROVER/ADMIN (revoga) |
| **Regras** | Período `[starts_at, expires_at)`; o estado é calculado pelo horário; não pode haver duas concessões ativas sobrepostas para o mesmo usuário e recurso; a revogação exige motivo |
| **Fluxo** | Lista "Meus acessos" com contagem regressiva → uso → expiração automática; aprovador revoga com motivo |
| **Erros** | Concessão sobreposta (`23P01` → 409) · revogar algo já revogado ou expirado (409) |
| **Persistência** | `pam.access_grants` com `EXCLUDE USING gist`; job que apenas audita expirações |
| **Aceite** | ✔ Depois de `expires_at`, a execução é negada e auditada como `DENIED` com motivo `grant_expired`. ✔ Uma revogação vale na requisição seguinte |
| **Testes** | T-PAM-07, T-PAM-08, T-DB-05 |

### F5. Consultas controladas (PK-07)

| | |
| --- | --- |
| **Problema** | Permitir o uso do acesso sem abrir um terminal SQL livre |
| **Usuários** | Quem tem uma concessão ativa |
| **Regras** | Apenas templates do catálogo do recurso; parâmetros validados por schema; READ só executa templates READ; resultado limitado a 500 linhas; tempo-limite de 3 s |
| **Erros** | Sem concessão ativa (403) · parâmetros inválidos (400) · tempo-limite (504 com `57014` registrado) |
| **Segurança** | Papel `dbwatch_target_ro` + `BEGIN READ ONLY`; consulta parametrizada; a auditoria guarda o hash dos parâmetros, não os valores |
| **Persistência** | `pam.query_templates` (por migration), `pam.query_executions` |
| **Aceite** | ✔ Uma tentativa de escrita, mesmo por um template malicioso hipotético, falha por ser somente leitura. ✔ Toda execução fica registrada com a duração e a quantidade de linhas |
| **Testes** | T-PAM-09, T-PAM-10, T-SEC-06 |

### F6. Auditoria (PK-03)

| | |
| --- | --- |
| **Problema** | Ter uma prova confiável do que aconteceu |
| **Usuários** | AUDITOR (consulta e verifica); todo o sistema escreve |
| **Regras** | Registra ator, ação, recurso, resultado, motivo, `correlation_id`, IP e metadados permitidos; nunca é alterada ou apagada; a consulta à auditoria também é auditada |
| **Fluxo** | Explorador com filtros (período, ator, ação, resultado, `correlation_id`) → detalhe → "Verificar integridade" |
| **Erros** | Filtro inválido (400) · sem permissão (403) |
| **Segurança** | Grants, triggers e cadeia de hash; metadados validados por lista de campos permitidos |
| **Persistência** | `audit.audit_log` (BRIN em `occurred_at`); sucesso gravado na mesma transação da ação, falha gravada em transação separada |
| **Aceite** | ✔ Toda ação de F1 a F5 gera um registro. ✔ Uma adulteração direta no banco é apontada pela verificação. ✔ Uma ação que falhou (rollback) continua registrada como `FAILURE` |
| **Testes** | T-DB-07 a T-DB-11, T-INT-08, T-INT-09 |

### F7. Monitor (PK-08)

| | |
| --- | --- |
| **Problema** | Enxergar o que acontece no banco e relacionar com a aplicação |
| **Usuários** | APPROVER, ADMIN, AUDITOR |
| **Regras** | Amostragem a cada 5 s; cada dado exibe a fonte (`POSTGRES_OBSERVED`, `APPLICATION` ou `LAB`); retenção de 7 dias; o texto das queries não é armazenado |
| **Fluxo** | Dashboard: indicadores, série temporal de commits × rollbacks, sessões ativas, grafo de bloqueio ao vivo e fluxo de eventos |
| **Erros** | Coletor sem permissão em `pg_monitor` → alerta na tela "coleta indisponível" (o sistema não inventa dados) |
| **Persistência** | `monitor.*_samples`, `monitor.app_events`, view `monitor.event_feed`; taxas com `LAG()` |
| **Aceite** | ✔ Um lock wait provocado no psql aparece no grafo em até 10 s. ✔ Um deadlock incrementa o contador exibido. ✔ Nenhuma tela mostra dado sem fonte |
| **Testes** | T-MON-01 a T-MON-05 |

### F8. Laboratório de concorrência (PK-09)

| | |
| --- | --- |
| **Problema** | Demonstrar conceitos de transação de forma real e repetível |
| **Usuários** | ADMIN (na demo) |
| **Regras** | Seis cenários; um por vez; papel e schema isolados; timeouts obrigatórios; cada execução é registrada com os passos e o SQLSTATE |
| **Fluxo** | Escolher o cenário → "Executar" → linha do tempo animada com as sessões A e B lado a lado → resultado com a explicação do conceito |
| **Erros** | Outro experimento em andamento (409) · laboratório desativado (404) |
| **Aceite** | ✔ O cenário de deadlock termina com exatamente uma transação abortada com `40P01`. ✔ Nenhuma transação do lab dura mais que os timeouts configurados. ✔ Os mesmos cenários rodam pelo `psql` com os scripts de `infra/lab/` |
| **Testes** | T-LAB-01 a T-LAB-06 |

### F9. Interface (PK-10 a PK-12)

| | |
| --- | --- |
| **Problema** | Tornar tudo isso compreensível em poucos segundos, inclusive num projetor |
| **Regras** | Modo claro e escuro com contraste AA; navegação completa por teclado; `prefers-reduced-motion` respeitado; estados de carregamento, vazio, erro e sem permissão em toda tela; a interface esconde ações sem permissão, mas a API sempre revalida |
| **Aceite** | ✔ Zero violações sérias ou críticas do axe nas telas principais. ✔ Todas as telas funcionam a partir de 1280×720 (projetor) e de 375 px de largura |
| **Testes** | T-E2E-01 a T-E2E-06, T-A11Y-01 |

## 6. Métricas de sucesso da apresentação

- Os seis cenários do laboratório rodam ao vivo sem falhas em 3 ensaios seguidos.
- O fluxo PAM completo é demonstrado em menos de 3 minutos.
- Toda afirmação feita na apresentação pode ser reproduzida por um professor com os comandos do README.

## 7. Questões em aberto

| # | Questão | Quem decide | Impacto se não decidir |
| --- | --- | --- | --- |
| Q-1 | Detalhes da VPS (SO, RAM, domínio, forma de acesso) | @Gabrieldiog | O deploy (PK-14) fica bloqueado |
| Q-2 | Há outros integrantes no grupo para dividir front e back? | @Gabrieldiog | Muda o calendário do ROADMAP |
| Q-3 | Licença do repositório | @Gabrieldiog | Nenhum, para a apresentação |
| Q-4 | Tempo disponível para a apresentação no InovaTech | @Gabrieldiog | Ajusta o roteiro de [DEMO.md](DEMO.md) |
