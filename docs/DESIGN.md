# Design e identidade visual

> Status: **proposta para aprovação** (PK-00). Implementação no PK-10.

## 1. Conceito: o sentinela no escuro

<img src="assets/brand/dbwatch-icon-192.png" alt="Logo do DBWATCH" width="96" align="right">

A logo mostra um **suricato em pose de sentinela**, visto só como silhueta, recortado contra a luz de um radar e em pé sobre um banco de dados. O único detalhe visível é o **olho aceso**: você não vê o vigia, mas ele está vendo você.

A interface herda três ideias dessa imagem:

1. **Escuridão com pontos de luz.** No modo escuro, a tela é calma e profunda, e a cor só aparece onde há informação: um estado, um alerta, um dado vivo.
2. **O radar como gesto.** Círculos concêntricos, varredura e o pulso são a linguagem de "observando agora".
3. **Os três LEDs como semântica.** Verde-sinal, âmbar e coral significam a mesma coisa em todas as telas.

## 2. Cores

As cores foram extraídas da logo e ajustadas até passar no contraste **WCAG AA** (≥ 4,5:1 para texto normal). Os valores de contraste abaixo foram **calculados**, não estimados.

### Modo escuro (padrão)

| Token | Hex | Uso | Contraste sobre `bg` / `surface` |
| --- | --- | --- | --- |
| `--bg` | `#050E1E` | Fundo da aplicação | — |
| `--surface` | `#0B1A30` | Painéis, tabelas | — |
| `--surface-raised` | `#10233F` | Diálogos, menus | — |
| `--border` | `#1C3150` | Divisórias, contornos | — |
| `--text` | `#E4EEF7` | Texto principal | 16,4 / 14,8 |
| `--text-muted` | `#8EA3BF` | Texto secundário | 7,5 / 6,8 |
| `--signal` | `#2EEDC0` | Saudável, sucesso, ação principal | 12,9 / 11,6 |
| `--scan` | `#19D3D0` | Links, foco, dados "ao vivo" | 10,4 / 9,4 |
| `--amber` | `#FEB344` | Atenção, espera por lock, pendente | 10,8 / 9,8 |
| `--coral` | `#FD6A62` | Erro, deadlock, negado, rollback | 6,8 / 6,2 |

### Modo claro

O claro não é o escuro invertido: é o **"turno do dia"**. O fundo é uma névoa fria (nada de creme), e as cores de estado ficam mais escuras para manter o contraste.

| Token | Hex | Contraste sobre `bg` / `surface` |
| --- | --- | --- |
| `--bg` | `#EEF5F8` | — |
| `--surface` | `#FFFFFF` | — |
| `--surface-raised` | `#FFFFFF` + sombra | — |
| `--border` | `#D3E1EA` | — |
| `--text` | `#06122A` | 16,9 / 18,6 |
| `--text-muted` | `#4A5D78` | 6,1 / 6,7 |
| `--signal` | `#05735F` | 5,3 / 5,8 |
| `--scan` | `#00717C` | 5,2 / 5,8 |
| `--amber` | `#9A5B00` | 4,9 / 5,4 |
| `--coral` | `#C42D35` | 5,1 / 5,6 |

### Semântica de estados

| Estado no domínio | Cor | Ícone (nunca só a cor) |
| --- | --- | --- |
| Concessão ativa, commit, verificação íntegra | `--signal` | ● sinal cheio |
| Pedido pendente, lock wait, concessão perto de expirar | `--amber` | ◐ meio cheio |
| Negado, rollback, deadlock, cadeia quebrada | `--coral` | ✕ |
| Dado observado no PostgreSQL ao vivo | `--scan` | ◎ radar |
| Expirado, revogado, cancelado | `--text-muted` | ○ vazio |

**A cor nunca é a única pista:** todo estado também tem ícone e texto, para quem tem daltonismo e para o projetor, que distorce cores.

### Tema

- O padrão segue `prefers-color-scheme`. Um botão alterna claro, escuro e sistema, e a escolha fica salva.
- Tokens em CSS variables (`:root` e `[data-theme="dark"]`), mapeados no Tailwind.
- Um script mínimo no `<head>` aplica o tema antes da primeira pintura, para evitar o "piscar" de tema errado.

## 3. Tipografia

| Papel | Fonte | Por quê |
| --- | --- | --- |
| Títulos, números de indicadores | **Sora** (600 e 700) | Geométrica e aberta, conversa com os círculos do radar. Números grandes muito legíveis à distância |
| Texto, formulários, tabelas | **IBM Plex Sans** (400, 500, 600) | Desenhada para interfaces técnicas; distingue bem `I`, `l` e `1`; ótima no projetor |
| SQL, IDs, hashes, SQLSTATE | **IBM Plex Mono** (400, 500) | Mesma família do texto, então o código não "destoa"; algarismos tabulares |

Todas são **servidas localmente** via `next/font` (sem requisições a terceiros em tempo de execução) e têm licença OFL.

### Escala (razão 1,25, base 16 px)

| Token | Tamanho / altura de linha | Uso |
| --- | --- | --- |
| `display` | 49 / 56 · Sora 700 | Número principal de um indicador |
| `h1` | 39 / 46 · Sora 700 | Título da página |
| `h2` | 31 / 38 · Sora 600 | Seção |
| `h3` | 25 / 32 · Sora 600 | Card e painel |
| `body-lg` | 20 / 30 · Plex Sans | Destaques e textos explicativos do laboratório |
| `body` | 16 / 26 · Plex Sans | Padrão |
| `small` | 13 / 20 · Plex Sans 500 | Metadados e legendas (nunca abaixo de 13 px) |
| `code` | 14 / 22 · Plex Mono | SQL e identificadores |

- Linhas de texto com até ~75 caracteres.
- Rótulos em *sentence case* (nada de CAIXA ALTA em rótulos).
- Números de tabelas e indicadores com algarismos tabulares (`font-variant-numeric: tabular-nums`), para que os valores não "dancem" ao atualizar.

## 4. Motion

**Regra principal: o movimento só acontece quando algo real aconteceu.** Nenhuma animação simula atividade. Se a coleta parou, o radar para e a tela diz isso. É a versão visual do princípio "não fingir monitoramento".

### Momentos assinatura

| Momento | O que se move | Significado |
| --- | --- | --- |
| **Login** | A silhueta do sentinela com a varredura do radar girando atrás | O sistema está vigiando. É a única animação contínua "decorativa", e para depois do login |
| **Fluxo de eventos** | Cada evento novo entra em 160 ms, com a borda na cor da fonte (`scan` = PostgreSQL, `signal`/`coral` = aplicação, `amber` = LAB) | Algo acabou de acontecer, e de onde veio |
| **Grafo de bloqueio** | Arestas "A → B" com tracejado fluindo enquanto B espera; num deadlock, o ciclo acende em coral e a aresta da vítima se rompe | Quem bloqueia quem; o PostgreSQL escolhendo uma vítima |
| **Linha do tempo do lab** | As sessões A e B em duas colunas; cada passo aparece **quando o evento real chega** pelo SSE | A ordem real dos acontecimentos, sem roteiro falso |
| **Contagem regressiva da concessão** | Um anel que diminui e fica âmbar nos últimos 20% | O acesso é temporário |
| **Verificação da auditoria** | Uma varredura percorre a cadeia; um elo quebrado fica em coral e a tela rola até ele | Onde a integridade falhou |

### Parâmetros

| Tipo | Duração | Curva |
| --- | --- | --- |
| Retorno de interação (hover, press, foco) | 120 a 160 ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Mudança de estado (abrir painel, nova linha) | 200 a 320 ms | mesma curva, ou mola suave do Motion |
| Coreografias (grafo, linha do tempo) | 400 a 700 ms | mola com amortecimento alto (sem "quicar") |
| Varredura do radar | 6 a 8 s por volta | linear |

- `prefers-reduced-motion: reduce` desliga as varreduras e os tracejados e troca as entradas por mudanças instantâneas de opacidade. A informação continua toda lá.
- Nada de entrada animada em cada card da página nem efeitos de hover em tudo. Uma coreografia bem feita vale mais que vinte efeitos espalhados.

## 5. Layout

```text
┌──────────────┬───────────────────────────────────────────────────────┐
│  ◉ DBWATCH   │  Título da página                       [tema] [Ana ▾]│
│              ├───────────────────────────────────────────────────────┤
│  Visão geral │                                                       │
│  Pedidos     │   Conteúdo principal                                  │
│  Aprovações  │   (largura máxima de 1280 px, alinhado à esquerda)    │
│  Meus acessos│                                                       │
│  Auditoria   │                                                       │
│  Monitor     │                                                       │
│  Laboratório │                                                       │
│  ─────────── │                                                       │
│  Admin       │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```

- A navegação lateral mostra só os itens que o usuário pode acessar (a API revalida tudo).
- Alinhamento à esquerda e grade de 8 px. Raios diferentes por hierarquia: 6 px em controles, 12 px em painéis e círculos para os elementos do radar.
- Funciona em 1280×720 (projetor) sem rolagem horizontal e se reorganiza até 375 px.

## 6. Componentes e estados obrigatórios

Toda tela tem quatro estados, cada um com um texto específico e uma ação:

| Estado | Exemplo de texto |
| --- | --- |
| Carregando | Esqueleto com a forma do conteúdo (sem spinner genérico em tela cheia) |
| Vazio | "Nenhum pedido pendente. Novos pedidos aparecem aqui assim que forem enviados." |
| Erro | "Não foi possível carregar a auditoria. Tente de novo. Código para suporte: `c0ffee12`." |
| Sem permissão | "Esta área é da auditoria. Peça o papel Auditor a um administrador." |

Botões dizem exatamente o que fazem ("Aprovar acesso", "Revogar acesso"), e a confirmação repete o mesmo verbo ("Acesso aprovado").

## 7. Uso da logo

| Arquivo | Uso |
| --- | --- |
| `assets/brand/dbwatch-logo.png` (1254 px, com margem) | Arte original e material de apresentação |
| `assets/brand/dbwatch-icon.png` (1024 px, cantos transparentes) | Base para os demais tamanhos |
| `assets/brand/dbwatch-icon-512.png` | README e slides |
| `assets/brand/dbwatch-icon-192.png` | PWA e ícone de atalho |
| `assets/brand/dbwatch-icon-64.png`, `-32.png` | Favicon e cabeçalho da aplicação |

- Não recolorir, não distorcer e não aplicar sombra ou contorno.
- Tamanho mínimo: 24 px. Abaixo disso, o suricato deixa de ser reconhecível.
- Por ter fundo próprio, a logo funciona nos dois temas.

## 8. Acessibilidade

- Contraste AA garantido pelos tokens acima e conferido com o axe no CI.
- Foco sempre visível (anel de 2 px em `--scan`, com 2 px de afastamento).
- Gráficos com tabela alternativa ("ver como tabela") e `aria-label` com o resumo.
- Atualizações ao vivo anunciadas com `aria-live="polite"` e limitadas, para não inundar o leitor de tela.
- Alvos de toque de pelo menos 40×40 px.
