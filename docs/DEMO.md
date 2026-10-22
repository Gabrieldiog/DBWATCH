# Roteiro da demonstração: InovaTech 2026

> Status: **rascunho** (PK-00). Será ensaiado e ajustado no PK-15. O tempo disponível no evento ainda precisa ser confirmado (questão Q-4 do [PRD](PRD.md#7-questões-em-aberto)).

## 1. Mensagem central

> "Num sistema que controla acessos privilegiados, **o banco de dados é a última linha de defesa**, e conseguimos provar isso ao vivo."

Tudo o que for mostrado é **real** e reproduzível. Quando algo for um experimento provocado de propósito, isso é dito em voz alta e aparece na tela com o rótulo `LAB`.

## 2. Preparação (antes de entrar na sala)

- [ ] Ambiente da VPS no ar, `GET /api/health` verde. Ambiente local idêntico rodando no notebook como plano B.
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
| 3:45 | **PAM: corrida** | Bruno e Carla clicam "Aprovar" quase juntos (ou o script de concorrência) | **Lock de linha + `UPDATE` condicional**: um vence e o outro recebe 409. Uma concessão só |
| 4:30 | **Concessão** | Diego vê o anel de contagem regressiva e executa uma consulta do catálogo | `EXCLUDE` com `tstzrange`; transação `READ ONLY`; `statement_timeout` |
| 5:30 | **Auditoria** | Eva filtra pelo `correlation_id` e vê pedido → aprovação → concessão → consulta | Trilha completa ligando os eventos |
| 6:15 | **Adulteração** | No `psql` como superusuário, desligar o trigger e alterar um registro → Eva clica "Verificar integridade" → elo em coral | **Triggers + cadeia de hash**: a mudança é detectada e a linha exata é apontada |
| 7:15 | **Rollback** | Lab: transferência com falha | **Atomicidade**: o débito que já tinha acontecido é desfeito |
| 8:00 | **Lock ao vivo** | Lab: espera por lock; o grafo do monitor desenha "A bloqueia B" | `pg_locks` + `pg_blocking_pids()`; dados **observados** no PostgreSQL |
| 9:00 | **Deadlock** | Lab: deadlock; a aresta se rompe e o contador nativo sobe | O PostgreSQL detecta o ciclo e aborta uma vítima com `40P01` |
| 10:00 | **Isolamento** | Lab: write skew em `READ COMMITTED` vs `SERIALIZABLE` | Níveis de isolamento; `40001` como proteção |
| 10:45 | **Índices** (se houver tempo) | Lab: `EXPLAIN ANALYZE` sem índice × B-tree × BRIN | Custo, páginas lidas, tamanho do índice |
| 11:15 | **Qualidade** | Mostrar o CI verde e a contagem de testes de banco e de segurança | Cada regra tem um teste que tenta violá-la |
| 11:45 | **Fechamento** | Logo + limites honestos (superusuário, amostragem) + próximos passos | Engenharia responsável: sabemos o que garantimos e o que não |

### Versão curta (~6 min)

Abertura → autoaprovação barrada no banco → corrida de aprovação → adulteração detectada → deadlock ao vivo → fechamento.

## 4. Plano B

| Falha | Ação |
| --- | --- |
| VPS fora do ar ou sem internet | Trocar para o ambiente local (mesmo seed, mesmos usuários) |
| Notebook com problema | Vídeo de backup com narração ao vivo |
| Um cenário do lab falha | Rodar o mesmo cenário pelo script em `infra/lab/` com dois terminais `psql` (o caminho mais transparente) |
| Projetor com cores lavadas | Tema claro + zoom maior; os estados também têm ícone e texto |

## 5. Perguntas prováveis da banca

| Pergunta | Resposta curta | Onde está |
| --- | --- | --- |
| "E se o administrador do banco apagar a auditoria?" | Ele consegue, porque é superusuário. Mas a cadeia de hash detecta a mudança. A evolução é ancorar o último hash fora do banco | [SECURITY §7](SECURITY.md#7-limites-conhecidos) |
| "Por que não JWT?" | Revogação imediata é obrigatória num PAM | [ADR-005](DECISIONS.md#adr-005--sessões-no-servidor) |
| "Esse monitor é de verdade?" | Sim: amostras das views nativas `pg_stat_*`, cada dado com a fonte identificada. O que não vemos está documentado | [ARCHITECTURE §4](ARCHITECTURE.md#4-monitor) |
| "Como evitam SQL injection?" | Só consultas parametrizadas e catálogo fixo, além de testes com payloads de injeção | [TEST_PLAN](TEST_PLAN.md) T-SEC-06 |
| "Por que BRIN na auditoria?" | Tabela append-only, com o tempo correlacionado à posição física; o índice fica minúsculo | [DATA_MODEL §4](DATA_MODEL.md#4-índices) |
| "Por que a cadeia exige READ COMMITTED?" | Em REPEATABLE READ, o snapshot não veria a última linha confirmada, e a cadeia se bifurcaria | [DATA_MODEL §3.7](DATA_MODEL.md#37-cadeia-de-hash) |
