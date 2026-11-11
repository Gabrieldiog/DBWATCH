# Changelog

Todas as mudanças relevantes do DBWATCH são registradas aqui.
O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e o versionamento segue o [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Mudado

- **PK-30 · Consultas mais limpas e Escrita sem DELETE**
  - Escrita passa a incluir e alterar, sem apagar: o papel do recurso perdeu o `DELETE` (menor privilégio; um `DELETE` sem `WHERE` esvaziaria a tabela). Rode `pnpm db:target` para aplicar num banco que já existe.
  - O resultado das Consultas abre numa janela por cima, sem esticar os cartões; o aviso de sem acesso fica em português claro, com o link para pedir.
  - O nível aparece como "Leitura" e "Leitura e escrita".

- **PK-31 · Auditoria mais legível**
  - Filtros em grade, com a ação escolhida numa lista em português.
  - Coluna "O que aconteceu": a ação em português, o motivo traduzido e o código técnico pequeno; os dados técnicos ficam em "Ver dados", em pares nome e valor, no lugar do JSON cru.

- **PK-32 · README com as telas de agora**
  - Capturas novas do Console SQL, da simulação passo a passo, do Laboratório e da Auditoria, tiradas do sistema rodando.
  - Seção do Monitor com quem fez, o Detalhar e a retenção de 7 dias; textos do Monitor e do Console alinhados com "Leitura e escrita".

## [1.2.0] - 2026-11-09

Feita depois do teste na VPS, pensando em quem não é de TI: o console explica o erro do banco em português, o Monitor diz quem fez cada coisa e por quê, e o pedido de acesso chega só para quem foi escolhido, com a regra no banco.

### Destaques

- **Console SQL para todos:** com Leitura também dá para digitar SQL (a transação é `READ ONLY`), com SQL pronto por recurso e o erro do PostgreSQL explicado em português, com o original embaixo.
- **Monitor que explica:** todo evento diz quem fez e em qual recurso; "Detalhar" conta o que aconteceu, e a tabela dos gráficos diz o que houve em cada intervalo de 5 s.
- **Quem pede escolhe quem aprova:** só a pessoa escolhida decide, garantido por três CHECK no banco.
- **Telas mais compactas:** cartões em grade, formulários em colunas e históricos recolhidos.
- **Qualidade:** 146 testes de API e banco, 58 unitários do front e 80 E2E, todos no CI.

### Adicionado

- **PK-23 · Console SQL também na Leitura**
  - Com acesso de Leitura, o Console SQL aceita SQL digitado numa transação `READ ONLY`: consultar funciona e qualquer alteração volta com o erro `25006` do PostgreSQL. As Consultas do catálogo continuam para quem prefere não digitar.
  - SQL pronto por recurso, em três grupos: ler, alterar (precisa de Escrita) e o que o banco recusa.
  - A auditoria do console guarda o nível do acesso usado.

- **PK-24 · Console SQL para quem não é de TI**
  - Erro explicado em português (nível de acesso, outra tabela, estrutura, sintaxe, tempo-limite, regras da tabela), com a resposta original do PostgreSQL embaixo.
  - Recursos em cartões com o acesso de cada um, exemplos coloridos por intenção (ler, alterar, o banco recusa) e o comando num terminal; Ctrl + Enter executa.
  - Resultado em português ("1 linha alterada") e listas de escolha com a mesma seta nos dois temas.

- **PK-25 · Monitor diz quem fez e explica cada evento**
  - Todo evento da auditoria mostra quem fez e o recurso, numa frase ("Diego Solicitante tentou consultar Financeiro, mas foi negado: não tinha acesso a esse recurso"). Vai só o nome de exibição; e-mail, IP e metadados continuam só na auditoria.
  - "Detalhar" em cada evento abre a explicação: o deadlock da simulação diz qual transferência caiu e por quê; o "Deadlock detectado" do contador diz o que o DBWATCH vê e o que não vê.
  - Simulação automática mais lenta (5 s entre as ações do Ato 1 e do Ato 3) e o passo "Teste: o banco também barra" explicado.

- **PK-26 · Quem pede escolhe quem aprova**
  - "Quem vai aprovar" no pedido, com quem é do papel Aprovação primeiro; só essa pessoa aprova ou rejeita. Em sensibilidade alta, a primeira aprovação é de outra pessoa e a escolhida dá a final.
  - No banco: `approver_id` com FK e três CHECK (ninguém escolhe a si mesmo; decisão só da escolhida; primeira aprovação de outra pessoa). Pedidos antigos e break-glass ficam sem escolha e seguem a regra de antes.
  - Aprovações e Meus pedidos mostram para quem o pedido foi.

- **PK-27 · Commits e rollbacks com o porquê**
  - "Ver como tabela" ganhou a coluna "O que aconteceu": os eventos que o DBWATCH registrou em cada intervalo de 5 s (quem fez o quê, passos da simulação, a coleta do monitor).
  - O rollback é ligado ao evento que voltou mesmo quando o contador do PostgreSQL chega na amostra seguinte; sem evento, a linha diz que o banco só informa o número.

- **PK-28 · Telas mais compactas**
  - Laboratório e Consultas com cartões em grade (o que abre resultado ocupa a linha inteira) e nome curto em cada experimento.
  - Pedir acesso e Emergência em duas colunas; Meus acessos separa "Valendo agora" do histórico recolhido; históricos longos mostram os 8 mais recentes.
  - "O que é esta tela?" e as frases de abertura mais curtas; pedidos de emergência dizem "Emergência, sem aprovação".

## [1.1.0] - 2026-11-08

Tudo o que mudou depois do primeiro uso de verdade: o sistema passou a se demonstrar sozinho, cada tela explica o que é, e o nível Escrita ganhou uso, sempre com o banco decidindo o limite.

### Destaques

- **Bot da simulação:** o ▶ do Monitor faz um acesso do começo ao fim, o incidente no banco e a verificação da trilha, tudo de verdade; o modo passo a passo para depois de cada ação; e um bot com mouse usa as telas reais num navegador visível.
- **Console SQL com escrita:** um comando por vez, limitado por um papel do PostgreSQL por recurso (só a tabela do recurso, sem DDL), com o comando inteiro na auditoria.
- **Monitor com toda ação:** cada registro da auditoria vira um evento ao vivo, por trigger no próprio banco.
- **Telas que se explicam:** guia na Visão geral, "O que é esta tela?" em cada área e consultas novas com parâmetros em lista.
- **Qualidade:** 143 testes de API e banco, 48 unitários do front e 79 E2E, todos no CI.

### Adicionado

- **PK-19b · Simulação passo a passo**
  - Botão "Passo a passo" no Monitor: o bot faz uma ação no banco e espera o "Próximo passo" de quem apresenta.
  - No incidente ele só para onde nenhum lock fica preso; sem clique por 5 min, termina sozinho.

- **PK-21b · Tela do console SQL**
  - Nova área "Console SQL": escolher o recurso, ver se o acesso de Escrita está vivo (ou pedir, com o nível já marcado), escrever o comando e ver o resultado ou o erro do PostgreSQL.
  - Exemplos prontos por recurso, inclusive tentativas que o banco recusa (outra tabela, DROP, TRUNCATE).

- **PK-21a · Console SQL com escrita (API e banco)**
  - `POST /api/console/execute`: com um acesso de Escrita aprovado e vivo, um comando SQL roda de verdade no banco da loja, um por vez, com tempo-limite, e o comando inteiro vai para a auditoria.
  - Um papel de escrita por recurso (`dbwatch_rw_*`, sem login): só a tabela daquele recurso, sem DDL nem TRUNCATE. O banco-alvo não tem `plpgsql` para quem não é dono, e a conexão é descartada depois de cada comando.

- **PK-20c · O Monitor mostra tudo**
  - Cada registro de auditoria (consulta, login, pedido, aprovação, papel, regra) vira um evento ao vivo no Monitor, com a ação em português, o resultado e o motivo; quem fez fica só na Auditoria.
  - O evento nasce por trigger na mesma transação do registro: ação desfeita não aparece.

- **PK-20b · Cada tela se explica**
  - A Visão geral virou o guia do sistema: cada área que a pessoa enxerga (o que é e para quê), os quatro papéis e as permissões em português.
  - "O que é esta tela?" em Monitor (cada número explicado, inclusive de onde vêm os commits), Laboratório, Pedir acesso, Aprovações, Meus acessos, Auditoria, Usuários (papéis e regras de login) e Sessões.

- **PK-20a · Consultas que se explicam**
  - A tela agrupa as consultas por recurso e diz se você tem acesso e até quando; sem acesso, um link abre o pedido já no recurso certo.
  - Cada consulta tem descrição; cidade e categoria viram listas com os valores que existem, e a API recusa valor fora delas. Quatro consultas novas no catálogo (8 no total).

- **PK-19a · O bot com mouse**
  - `pnpm --filter @dbwatch/web bot`: um navegador visível usa as telas reais sozinho, com cursor desenhado e legenda, passando pelas quatro pessoas; funciona local ou apontado para a VPS (`DBWATCH_URL`).

- **PK-18 · O bot da simulação**
  - O ▶ do Monitor virou uma história em três atos, toda real: Diego pede acesso, tenta aprovar o próprio pedido (a API recusa e, pulando a API, o banco recusa com `23514`), Bruno aprova, Diego consulta; depois o incidente no banco; no fim, Eva verifica a cadeia de hash.
  - O bot age só como os personagens do seed, pelos mesmos serviços das rotas; cada ação fica na auditoria com o autor certo, a marca `simulacao` e o link a partir do Monitor.

### Corrigido

- CI do main vermelho desde o PK-20b: o teste do bot da simulação falhava às vezes (a narração dependia da ordem em que o aviso da conexão derrubada chegava ao Node; agora pergunta à própria conexão), e um teste do PK-20c tinha erro de tipo.

## [1.0.0] - 2026-11-07

Primeira versão completa, para a apresentação no InovaTech 2026 (11/11/2026).

### Destaques

- **PAM:** pedido justificado, aprovação por outra pessoa (duas para recurso sensível), concessão temporária com expiração pelo relógio do banco, consultas controladas e break-glass revisado depois. A separação de funções e a não sobreposição de concessões são garantidas por CHECK, EXCLUDE, trigger e RLS no PostgreSQL.
- **Auditoria:** append-only com cadeia de hash verificada dentro do banco, filtros por pessoa, ação, período e código da execução.
- **Monitor:** amostras reais de `pg_stat_activity`, `pg_locks` e `pg_stat_database` a cada 5 s, grafo de bloqueio, contador de deadlocks e eventos ao vivo por SSE.
- **Laboratório (LAB):** seis experimentos reais (rollback, espera de lock, deadlock, leitura não repetível, write skew e índices) e um bot que demonstra o sistema sozinho em três atos (acesso, incidente e verificação).
- **Qualidade:** 137 testes de API e banco, 43 unitários do front e 69 E2E no Chromium com axe, todos no CI; deploy em contêineres na VPS.

### Adicionado

- **PK-15 · Release e ensaio**
  - Ensaio automatizado da apresentação (`pnpm --filter @dbwatch/web ensaio`): percorre o roteiro no navegador, mede cada bloco e grava o vídeo de backup.
  - README final com capturas de tela, números reais dos testes e estrutura atual; DEMO.md ensaiado, com os tempos medidos e o bloco do break-glass.

- **PK-17e · Break-glass e ACL de login na tela**
  - Formulário de acesso de emergência em "Pedir acesso" e fila de revisão em "Aprovações".
  - Regras de login por IP e horário em "Usuários", com os erros das CHECKs do banco mostrados na tela.

- **PK-17d · Pendências menores**
  - Criar usuário sem digitar senha: a API gera uma senha inicial forte e mostra uma vez só.
  - Tela "Minhas sessões" para ver onde a conta está aberta e encerrar outro aparelho.
  - Esqueleto de carregamento nas telas do console; telas fora do papel continuam respondendo 404 de verdade.

- **PK-17c · Laboratório: índices**
  - Sexto cenário: a mesma consulta numa tabela de 200 mil leituras sem índice, com B-tree e com BRIN, com o plano real, as páginas lidas e o tamanho de cada índice. Também em `infra/lab/06-indices.sql` para o psql.

- **PK-17b · Simulação de incidente ao vivo (LAB)**
  - Botão "Iniciar simulação" no Monitor: quatro sessões reais encenam o fechamento do mês (transação esquecida, espera de lock, `lock_timeout`, a transação derrubada pelo próprio PostgreSQL e um deadlock resolvido), e cada passo é narrado no fluxo de eventos com a fonte LAB.

- **PK-17a · Pontos do roteiro**
  - Monitor: contador de deadlocks dos últimos 30 minutos e a fonte de cada dado e de cada evento.
  - Auditoria: filtros por pessoa (e-mail) e por período.
  - Laboratório: depois de cada experimento, a explicação do conceito com um exemplo da vida real.

- **PK-16 · Página de entrada**
  - A raiz e o `/entrar` viraram uma página só: o que o DBWATCH faz, o fluxo de um acesso, as seis garantias do banco com a regra SQL de cada uma e o login já visível.

- **PK-14 · Deploy**
  - Dockerfiles da API e do web, `docker-compose.prod.yml` (só o web publica porta, limite de memória por contêiner), `.env.prod.example` e `infra/deploy/backup.sh` (`pg_dump` diário, 7 dias).
  - `docs/DEPLOY.md` com deploy, atualização, rollback e restauração do backup.
  - Variável `TRUST_PROXY` (`loopback` ou `uniquelocal`) para a API ver o IP real do cliente atrás do web.
  - O cookie de sessão só é `Secure` com `APP_ORIGIN` em `https://`, e a API avisa no log quando roda em produção sem HTTPS.

- **PK-13b · QA final**
  - Atalho "Pular para o conteúdo" no console, para quem navega por teclado.
  - Script `infra/carga/aprovacao-concorrente.mjs`: a corrida de aprovação repetida, para a demonstração e para carga leve.

- **PK-12c · Laboratório**
  - Tela "Laboratório" com os cinco experimentos rotulados LAB e a linha do tempo das sessões A e B, com tempo, resultado e SQLSTATE de cada passo.
  - O cenário "espera de lock" segura o lock por 6 s, o bastante para o grafo do monitor mostrar o bloqueio ao vivo.

- **PK-12b · Monitor: grafo de bloqueio e eventos ao vivo**
  - Grafo "quem bloqueia quem" desenhado a partir da última amostra de `pg_locks`, com a tabela de cada lock ao lado.
  - Eventos ao vivo pelo SSE: rollbacks da API, espera longa por lock, transação parada, deadlock e break-glass, cada rollback com link para a trilha de auditoria.

- **PK-12a · Monitor: indicadores e séries**
  - Tela "Monitor" com as sessões do PostgreSQL por estado, esperas por lock e cache hit, lidas da última amostra real.
  - Gráficos de commits e de rollbacks a cada 5 s nos últimos 30 minutos, com tabela alternativa e resumo para leitor de tela.
  - Aviso quando a coleta para, em vez de mostrar números velhos como se fossem atuais.

- **PK-11f · Administração de usuários**
  - Tela "Usuários" para o admin: criar usuário, dar e tirar papéis, ativar, desativar e encerrar sessões.
  - As negações do banco aparecem na tela com o motivo: ninguém dá papel a si mesmo, e o último ADMIN ativo não pode sair.
  - Desativar alguém revoga as sessões dessa pessoa na mesma transação.

- **PK-11e · Explorador da auditoria**
  - Tela "Auditoria" com filtros por código da execução, ação e resultado, e paginação que não pula nem repete linhas quando chegam registros novos.
  - Clicar no código de uma linha mostra todos os registros do mesmo fluxo.
  - Botão "Verificar integridade", que recalcula a cadeia de hash no banco e aponta o primeiro registro adulterado, se houver.

- **PK-11d · Consultas do catálogo**
  - Tela "Consultas" com um cartão por consulta do catálogo, campos para os parâmetros e o resultado em tabela.
  - Cada execução mostra quantas linhas voltaram, o tempo e o código da execução, o mesmo `correlation_id` que fica na trilha de auditoria.
  - Mensagens claras para tempo-limite estourado, falha do banco-alvo e concessão vencida, revogada ou inexistente.

- **PK-11c · Meus acessos e revogação**
  - Tela "Meus acessos" com o estado de cada concessão e a contagem regressiva, que parte dos segundos calculados pelo banco e fica âmbar nos últimos 5 minutos.
  - Quando o tempo acaba com a tela aberta, ela se redesenha sozinha e mostra "Expirado".
  - Quem pode revogar vê os acessos ativos de todos e revoga com um motivo, que vai para a trilha de auditoria.

- **PK-11b · Formulário de pedido e aprovações**
  - Formulário de pedido: recurso, nível, duração limitada pelo máximo do recurso e justificativa com contador.
  - Tela "Aprovações" com a fila em cartões, aprovar e rejeitar com motivo num diálogo; o motivo aparece para quem pediu.
  - Recurso HIGH mostra "1 de 2 aprovações" e trava o botão de quem já aprovou; a API e o banco continuam barrando de qualquer jeito.
  - A fila da API passa a informar quem deu a primeira aprovação (`firstApprovedById`).

- **PK-11a · Base das telas e meus pedidos**
  - Tela "Pedir acesso" com a lista dos meus pedidos, o estado de cada um, o motivo da decisão e o botão de cancelar o que ainda está pendente.
  - Base reaproveitada pelas próximas telas: leitura no servidor com a sessão de quem pediu, envio que mostra a mensagem da própria API, badge de estado e tabela que vira blocos no celular.
  - Tela fora do papel responde 404, como a API faz com recurso de outra pessoa.

- **PK-10d · Sessão expirada, erros e testes de navegador**
  - O login avisa quando a sessão terminou ou quando a pessoa saiu.
  - Telas próprias de erro (sem detalhe técnico, com "Tentar de novo") e de página não encontrada.
  - `pnpm test:e2e`: login, sair e sessão encerrada em outro lugar no Chromium, mais o axe nos dois temas; roda também no CI.

- **PK-10c · Console com menu por permissão**
  - Menu lateral que mostra só as áreas liberadas pelos papéis de quem entrou; quem nega de verdade continua sendo a API.
  - O servidor confere a sessão na API antes de desenhar cada tela; sem sessão ou com sessão expirada, volta ao login e depois para a mesma página.
  - Botão de sair que encerra a sessão no banco, não só no navegador.

- **PK-10b · Tela de login com o radar**
  - Página `/entrar` com a varredura do radar atrás do suricato (parada para quem prefere menos movimento) e o seletor de tema.
  - Formulário que mostra as mensagens da própria API (senha errada, conta bloqueada, local ou horário negado) e nunca o detalhe de um erro interno.
  - Depois de entrar, volta para a página pedida só se for um caminho do próprio sistema.

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

### Corrigido

- As telas do Next agora mandam `X-Frame-Options`, `frame-ancestors 'none'`, `nosniff` e `Referrer-Policy`, como a API já fazia.
- `multer` fixado em 2.5.0 (falha alta de DoS na 2.4.0, não alcançável no DBWATCH); `pnpm audit` passou a rodar no CI.
- CI vermelho desde o PK-11d: o E2E agora roda num banco limpo (como o da apresentação) e recebe a URL do banco-alvo das consultas.
- `GET /api/monitor/locks` mostrava a última amostra que teve lock, mesmo quando o bloqueio já tinha acabado; agora lê sempre a amostra mais nova.


[Não lançado]: https://github.com/Gabrieldiog/DBWATCH/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Gabrieldiog/DBWATCH/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Gabrieldiog/DBWATCH/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Gabrieldiog/DBWATCH/releases/tag/v1.0.0
