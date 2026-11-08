# Roteiro da demonstração: InovaTech 2026

> Status: **ensaiado** (PK-15, 07/11/2026). A parte da tela roda sozinha pelo ensaio automatizado (seção 5), que também gera o vídeo de backup. O tempo disponível no evento ainda precisa ser confirmado (questão Q-4 do [PRD](PRD.md#7-questões-em-aberto)).

## 1. Mensagem central

> "Num sistema que controla acessos privilegiados, **o banco de dados é a última linha de defesa**, e conseguimos provar isso ao vivo."

Tudo o que for mostrado é **real** e reproduzível. Quando algo for um experimento provocado de propósito, isso é dito em voz alta e aparece na tela com o rótulo `LAB`.

## 2. Preparação (antes de entrar na sala)

- [ ] Ambiente da VPS no ar (`http://2.25.95.101:8088`), com a página inicial mostrando "PostgreSQL no ar". Ambiente local idêntico rodando no notebook como plano B.
- [ ] Na véspera: rodar `pnpm --filter @dbwatch/web ensaio` no ambiente local. Se passar, o roteiro inteiro funciona naquele banco; o vídeo novo fica em `apps/web/ensaio-results/`.
- [ ] Seed recém-aplicado: os usuários de demonstração (`diego.solicitante`, `bruno.aprovador`, `eva.auditora`, `ana.admin`) com senhas que **nunca aparecem na tela** (login feito antes, em janelas separadas).
- [ ] Quatro janelas ou perfis de navegador já logados: Diego, Bruno, Eva e Ana.
- [ ] Um terminal com `psql` conectado como `dbwatch_lab`, com os scripts de `infra/lab/` abertos.
- [ ] Projetor testado nos dois temas; escolher o que ficar mais legível na sala (normalmente o claro).
- [ ] Zoom do navegador em 125%.
- [ ] Vídeo de backup gravado no ensaio, aberto num player e pausado.

## 3. Roteiro (~12 min)

| Tempo | Bloco | O que fazer | O que dizer (conceito) |
| --- | --- | --- | --- |
| 0:00 | **Abertura** | Tela de login com o sentinela e o radar | O problema: acessos permanentes, compartilhados e sem rastro. O suricato sentinela vigia enquanto o grupo trabalha |
| 1:00 | **Arquitetura** | Um slide com o diagrama de componentes e as cinco camadas de defesa | O front não decide nada. API e banco garantem as regras |
| 2:00 | **PAM: pedido** | Diego pede acesso READ ao "financeiro" por 15 min, com justificativa | Validação, máquina de estados, `UNIQUE` parcial |
| 3:00 | **PAM: autoaprovação** | Mostrar no `psql` o `UPDATE` direto tentando a autoaprovação → `23514` | **CHECK constraint**: mesmo se a API tivesse um bug, o banco recusa |
| 3:45 | **PAM: corrida** | Bruno e Carla clicam "Aprovar" quase juntos (ou o script `infra/carga/aprovacao-concorrente.mjs`, que repete a corrida 30 vezes) | **Lock de linha + `UPDATE` condicional**: um vence e o outro recebe 409. Uma concessão só |
| 4:30 | **Concessão** | Diego vê o anel de contagem regressiva e executa uma consulta do catálogo | `EXCLUDE` com `tstzrange`; transação `READ ONLY`; `statement_timeout` |
| 5:30 | **Auditoria** | Eva clica no código da execução da consulta de Diego e vê o registro dela (quem, o quê, quando, resultado); depois filtra pela ação `pam.request_approve` e vê as duas aprovações do pedido | Cada requisição tem o seu código (`correlation_id`), que liga tudo o que ela gravou; o fluxo inteiro aparece pelas ações |
| 6:15 | **Adulteração** | No `psql` como superusuário, desligar o trigger e alterar um registro → Eva clica "Verificar integridade" → elo em coral | **Triggers + cadeia de hash**: a mudança é detectada e a linha exata é apontada |
| 7:15 | **Rollback** | Lab: transferência com falha | **Atomicidade**: o débito que já tinha acontecido é desfeito |
| 8:00 | **Lock ao vivo** | Lab: espera por lock; o grafo do monitor desenha "A bloqueia B" | `pg_locks` + `pg_blocking_pids()`; dados **observados** no PostgreSQL |
| 9:00 | **Deadlock** | Lab: deadlock; a aresta se rompe e o contador nativo sobe | O PostgreSQL detecta o ciclo e aborta uma vítima com `40P01` |
| 10:00 | **Isolamento** | Lab: write skew em `READ COMMITTED` vs `SERIALIZABLE` | Níveis de isolamento; `40001` como proteção |
| 10:45 | **Índices** (se houver tempo) | Lab: `EXPLAIN ANALYZE` sem índice × B-tree × BRIN | Custo, páginas lidas, tamanho do índice |
| 11:00 | **Break-glass** (se houver tempo) | Ana abre um acesso de emergência em "Pedir acesso"; o alerta "Acesso de emergência" sobe no Monitor; Bruno revisa em "Aprovações" | A única exceção à separação de funções, limitada por CHECK (15 min, 40 caracteres) e revisada por outra pessoa |
| 11:15 | **Qualidade** | Mostrar o CI verde e a contagem de testes de banco e de segurança | Cada regra tem um teste que tenta violá-la |
| 11:45 | **Fechamento** | Logo + limites honestos (superusuário, amostragem) + próximos passos | Engenharia responsável: sabemos o que garantimos e o que não |

### Console SQL com escrita (~1 min)

Diego pede **Escrita** em Clientes (o link do Console já abre o pedido marcado), Bruno aprova, e Diego, no **Console SQL**, aperta "Mudar a cidade de um cliente": o UPDATE roda de verdade e a linha volta na tela. Depois "Apagar pedidos (outra tabela)" e "Apagar a tabela": o PostgreSQL recusa com `42501` e a mensagem dele. O que dizer: "a aplicação não tenta adivinhar se o SQL é perigoso; quem limita é o papel do banco daquele recurso". No Monitor, cada comando aparece como "Comando no console SQL".

### O bot da simulação (LAB, ~55 s)

No Monitor, a Ana aperta **▶ Iniciar simulação** e o sistema se demonstra sozinho, em três atos, tudo de verdade. Dica: deixe a janela da Eva também no Monitor; para ela, cada passo do bot tem o link "ver na auditoria".

**Ato 1, um acesso do começo ao fim.** O bot age como os personagens do seed (nunca como uma pessoa real), pelos mesmos serviços das rotas: Diego pede leitura em Clientes; Diego tenta aprovar o próprio pedido e a API recusa ("Ninguém decide o próprio pedido"); em seguida o mesmo `UPDATE` vai direto ao banco, como se a API tivesse um bug, e o PostgreSQL recusa com `23514` na regra `access_requests_sod_ck` (o próprio monitor mostra o rollback da aplicação logo abaixo); Bruno aprova e a concessão nasce com prazo; Diego consulta os clientes. Cada ação fica na auditoria com o autor certo e a marca `simulacao` (quem apertou o play). O que dizer: "a regra existe duas vezes: na API e no banco; o bot acabou de provar as duas".

**Ato 2, o incidente.** Quatro sessões reais encenam o fechamento do mês: um relatório esquece uma transação aberta e trava o caixa (o grafo desenha relatório → caixa), o caixa desiste com `55P03` depois de 8 s e tenta de novo, o PostgreSQL derruba a transação esquecida depois de 20 s parada (`idle_in_transaction_session_timeout`) e, no fim, resolve um deadlock entre duas transferências (`40P01`, a vítima é repetida). Cada passo aparece no fluxo de eventos com a fonte LAB, ao lado dos alertas que o próprio coletor dispara. O que dizer: "isto é o que um DBA veria num incidente real, e nada aqui é encenado na tela: a tela só observa o banco".

**Ato 3, alguém confere.** Eva recalcula a cadeia de hash da trilha inteira dentro do banco: "Cadeia íntegra: N registros conferidos, incluindo cada passo desta simulação".

### Versão curta (~6 min)

Abertura → autoaprovação barrada no banco → corrida de aprovação → adulteração detectada → deadlock ao vivo → fechamento.

## 4. Plano B

| Falha | Ação |
| --- | --- |
| VPS fora do ar ou sem internet | Trocar para o ambiente local (mesmo seed, mesmos usuários) |
| Notebook com problema | Vídeo de backup com narração ao vivo |
| Um cenário do lab falha | Rodar o mesmo cenário pelo script em `infra/lab/` com dois terminais `psql` (o caminho mais transparente) |
| Projetor com cores lavadas | Tema claro + zoom maior; os estados também têm ícone e texto |

## 5. O bot com mouse (navegador que se usa sozinho)

Um navegador visível abre no notebook e usa as telas de verdade, com um cursor desenhado e uma legenda embaixo: Diego entra e pede acesso, tenta abrir Aprovações (404), Bruno aprova, Diego consulta, Eva filtra a auditoria e verifica a cadeia, Ana roda o deadlock no Laboratório, abre um break-glass e aperta o ▶ do Monitor. Leva uns 2 min 40 s; `BOT_RITMO=1.5` deixa 50% mais lento.

Contra a VPS (as senhas vêm do seed de lá, só no terminal):

```bash
# na VPS: gera senhas novas e imprime em JSON (derruba as sessões dos usuários demo)
docker compose -f docker-compose.prod.yml run --rm tools pnpm db:seed:json --permitir-producao
# no notebook, com o repositório e o pnpm install feitos (uma vez: pnpm --filter @dbwatch/web exec playwright install chromium)
DBWATCH_URL=http://2.25.95.101:8088 E2E_USERS='<a linha JSON do comando acima>' pnpm --filter @dbwatch/web bot
```

Em ambiente local, `pnpm --filter @dbwatch/web bot` sobe API e web, gera as senhas e roda. O vídeo de cada execução fica em `apps/web/bot-results/`.

## 6. Ensaio automatizado e vídeo de backup

`pnpm --filter @dbwatch/web ensaio` (com o build feito, como o E2E) percorre a parte do roteiro que acontece na tela, no navegador de verdade, contra a API e o banco de verdade, e grava um vídeo de 1280×720. Os blocos de `psql` (autoaprovação barrada e adulteração) ficam de fora: são mostrados no terminal ao vivo.

Tempos medidos no ensaio de 07/11/2026 (bot de três atos incluído), sem narração (as pausas para falar ficam por conta de quem apresenta):

| Bloco | Tempo na tela |
| --- | --- |
| Abertura: página inicial com o status real do banco | 5 s |
| PAM: Diego pede acesso a Clientes | 6 s |
| PAM: Bruno aprova | 4 s |
| Concessão: contagem regressiva e consulta do catálogo | 9 s |
| Auditoria: Eva verifica a cadeia de hash | 7 s |
| Laboratório: rollback, lock, deadlock, isolamento e índices | 30 s |
| Bot da simulação no Monitor (LAB): acesso, incidente e verificação | 49 s |
| Break-glass: Ana abre, o alerta sobe e Bruno revisa | 5 s |
| **Total** | **115 s** |

Conclusão do ensaio: a tela nunca é o gargalo. Os 12 minutos são de fala; se o tempo encurtar, a versão curta cabe com folga.

## 7. Perguntas prováveis da banca

| Pergunta | Resposta curta | Onde está |
| --- | --- | --- |
| "E se o administrador do banco apagar a auditoria?" | Ele consegue, porque é superusuário. Mas a cadeia de hash detecta a mudança. A evolução é ancorar o último hash fora do banco | [SECURITY §7](SECURITY.md#7-limites-conhecidos) |
| "Por que não JWT?" | Revogação imediata é obrigatória num PAM | [ADR-005](DECISIONS.md#adr-005--sessões-no-servidor) |
| "Esse monitor é de verdade?" | Sim: amostras das views nativas `pg_stat_*`, cada dado com a fonte identificada. O que não vemos está documentado | [ARCHITECTURE §4](ARCHITECTURE.md#4-monitor) |
| "Como evitam SQL injection?" | Só consultas parametrizadas e catálogo fixo, além de testes com payloads de injeção | [TEST_PLAN](TEST_PLAN.md) T-SEC-06 |
| "Por que BRIN na auditoria?" | Tabela append-only, com o tempo correlacionado à posição física; o índice fica minúsculo | [DATA_MODEL §4](DATA_MODEL.md#4-índices) |
| "Por que a cadeia exige READ COMMITTED?" | Em REPEATABLE READ, o snapshot não veria a última linha confirmada, e a cadeia se bifurcaria | [DATA_MODEL §3.7](DATA_MODEL.md#37-cadeia-de-hash) |
