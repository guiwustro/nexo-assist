# Nexo Assist — Análise para desenvolvimento

> Análise do desafio técnico (PRD v5 + protótipo no Pencil) e do que dá para trazer do DeskComm.
> Referências copiadas em `referencias/` (`Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf` e `nexo.pen`).
> Data: 2026-11-03.

---

## 0. Decisões tomadas (2026-11-03)

| Tema | Decisão | Consequência |
|---|---|---|
| Banco | **Postgres**: local no `docker compose`; produção no **Supabase usado só como Postgres** | Drizzle + `DATABASE_URL`. Sem SDK do Supabase, sem Supabase Auth/Realtime. Avaliador roda sem criar conta |
| Tempo real do console | **SSE** (`/api/eventos`) | Independente do Supabase; fallback polling |
| LLM | **DeepSeek** (`deepseek-chat`) via `@ai-sdk/deepseek` no Mastra | Barato (bom para "custo por conversa"). README cita o trade-off de privacidade (dados trafegam para a DeepSeek) e deixa `MODEL_ID` trocável |
| Serviço de chamados | **Molde do DeskComm**: container próprio (Hono) com `/healthz`, schema `tickets` no mesmo Postgres, agent acessa **só** pela borda `edge/tickets` (retry + disjuntor + `TicketsTransportError` transitório) | Ver §7.10 |
| Limite de 30 mensagens | Ao bater 30, o agent **oferece/transfere para um analista** com o resumo do caso | Contador continua visível; composer vira "Conversa com analista" |
| Deploy | **VPS do primare-hub** (`cliniai-vps`, HostGator, 2 vCPU / 3,8 GB RAM / 78 GB livres) com Docker Compose próprio em `/opt/nexo` (web + tickets), banco no Supabase | Ver §10.1 |
| Prazo | **Até 3 dias** | Plano enxuto da §10 |
| Estrutura | **Igual ao DeskComm**: app Next na raiz + `services/tickets` com `Dockerfile.tickets`; contratos Zod compartilhados em `lib/contracts/` | Sem monorepo (§12.1) |
| Acesso ao banco | **Drizzle** + migrations SQL versionadas em `db/migrations` | Tipos das tabelas saem do schema |
| Memória do agent | **Memória do Mastra** (`@mastra/pg`, schema `mastra`), thread = conversa, resource = funcionário | `messages` continua sendo o que a tela mostra; ao **devolver** a conversa, o código grava na thread uma nota com o que o analista fez |
| Convenções/tabelas/rotas | **Molde do DeskComm** (§12) | Vocabulário `ai_handling/pending/claimed/closed`, `ok()/fail()`, `event_log`, `idempotency_keys`… |
| Repositório | GitHub **público**, `desafio-tecnico-nexo-assist` | Nenhum segredo no código |
| Limiar de confiança | **0,6** (`AGENT_CONFIDENCE_THRESHOLD`) | Abaixo disso, transfere com motivo `low_confidence` |
| Guardrail pegou promessa/ação falsa | **Sempre transferir** para analista | O veto fica registrado na decisão do turno e no briefing da passagem |
| Painel de transparência | **Os dois**: resumo inline (1 linha: ação · confiança · porquê) + detalhe completo em painel lateral | §6.2 |
| Decisão do turno | Registrada no fechamento; se o modelo esquecer, chamada curta de fallback marcada como "registrada depois" (ausente ≠ vazia) | §6.1, §7.1 |

---

## 1. O desafio em uma frase

Construir o **Nexo Assist**: um agent de service desk de TI num chat, onde o funcionário descreve o
problema com as próprias palavras e o agent **consulta chamados, busca na central de ajuda, abre/atualiza
chamados (sempre com confirmação) e transfere para um analista** quando precisa — mais um **console do
analista** para assumir, devolver e encerrar conversas.

**A parte mais importante, dita pelo próprio PRD:** *visibilidade das decisões* — acima de cada resposta,
as ações do agent; e um detalhe legível de **o que entendeu, que ação tomou, com que confiança e por quê**.

### Como seremos avaliados (em ordem de peso provável)

| Critério | O que olham | Onde ganhamos ponto |
|---|---|---|
| Qualidade das decisões | Agent entende e escolhe a ação certa seguindo o Anexo A | Regras determinísticas em código + evals de cenário |
| Condução da conversa | Pergunta quando falta, confirma antes de agir, mantém contexto | Opções rápidas, rascunho, memória persistente |
| **Transparência** | Fácil ver o que o agent fez e por quê | Trilha de decisão estruturada + painel "Por quê?" |
| Interface | Fidelidade ao protótipo + estados de loading e erro | Tokens extraídos do `.pen`, estados de instabilidade |
| Arquitetura e boas práticas | Separação, tipagem, erros, commits | UI ↔ agent ↔ serviço de chamados separados |
| Comunicação | README claro | Seções pedidas pelo PRD, com diagrama |
| Diferencial | Deploy | Deploy com chave protegida + rate limit |

> ⚠️ Na entrevista eles vão **pedir mudanças ao vivo no código**. Isso pesa na arquitetura: o projeto
> precisa ser **enxuto e fácil de navegar**, não um mini-DeskComm. Cada decisão abaixo foi filtrada por
> "consigo mexer nisso em 5 minutos na frente de alguém?".

---

## 2. O que já temos

### 2.1 PRD (5 páginas)

- **Histórias do funcionário (6):** tirar dúvida sem chamado · saber status (sem lembrar número, e se está
  atrasado) · complementar chamado · abrir chamado conversando com rascunho · falar com analista · voltar
  outro dia e continuar.
- **Histórias do analista (3):** receber chamados bem classificados · ver conversas que precisam dele
  (incluindo baixa confiança do agent) · assumir (agent pausado), devolver ou encerrar.
- **O que construir (7 itens):** Login · Chat do funcionário · Agent · Serviço de chamados simulado ·
  Transferência · Console do analista · Visibilidade das decisões.
- **Técnico:** TypeScript estrito · **Mastra** (preferência) ou LangGraph.js · qualquer LLM (justificar no
  README) · Next.js/React · serviço de chamados **separado do agent** · persistência que sobrevive a
  restart · rodar com poucos comandos + `.env.example`.
- **Anexo A (regras):** ver §4.
- **Anexo B (dados):** nós criamos — funcionários, 5–10 artigos, chamados em situações variadas
  (aberto, vencido, resolvido recentemente, **de outros funcionários**).
- **Restrição escondida importante:** *"O sistema de chamados é legado e, de vez em quando, fica
  indisponível por alguns segundos."* → precisamos simular isso e tratar (retry/estado de erro na UI).

### 2.2 Protótipo (`nexo.pen`, Pencil v2.21 — é JSON, dá pra ler direto)

6 frames desktop (1440×900). O PRD cita 5 telas; a 6ª ("Meu perfil") é extra.

| # | Frame | Tela do PRD | Conteúdo-chave |
|---|---|---|---|
| 1 | Identificação (desktop) | Tela 1 — Login | Split: vitrine escura (headline serifada, preview de conversa, 3 stats) + formulário (e-mail, senha com toggle, "manter conectado", "Esqueci minha senha", ramal 4000) |
| 2 | Chat — Novo chamado | Tela 2 | Sidebar (Atendimento / Meu perfil / usuário / Sair), top bar com breadcrumb + "Assistente online", status line de ações, **opções rápidas numeradas 1–4**, **card de rascunho** (Categoria, Prioridade + prazo, Afetados; Confirmar `⌘↵` / Editar / Cancelar), composer + "18/30 mensagens nesta sessão" |
| 3 | Chat — Consulta e transferência | Tela 3 | **Seletor de chamado** (radio list), **card de chamado** com "prazo vencido", oferta: Falar com analista / Adicionar informação / Não, obrigado |
| 4 | Atendente — Conversas | Tela 4 | Rail 64px, lista 380px com busca + filtros (Todas / Para você 3 / Com o agent 9 / Minhas 1), tags de estado ("Transferida · INC-20311", "Agent pediu ajuda · confiança 41%", "Agent atendendo", "Resolvida pelo agent"), conversa com **barra de takeover** (Devolver ao agent / Assumir atendimento; composer bloqueado) e painel **Chamados da Ana** |
| 5 | Atendente — Atendimento assumido | Tela 5 | Header com Devolver ao agent / **Encerrar atendimento**, eventos de sistema ("Rafael Lima assumiu · agent pausado · 10:12"), bolha verde do humano com tag "Suporte N2", composer liberado |
| 6 | Cliente — Meu perfil | (extra) | Nome, e-mail "Gerenciado pela TI", senha "Alterada há 42 dias" + Redefinir senha |

**Design tokens usados de fato** (o arquivo tem um segundo conjunto — `bg/surface/fg/Geist…` — que não é
usado por nenhum nó; ignorar):

```
--paper:#FFFFFF  --desk:#F6F7F9  --ink:#1B2431  --ink-2:#3D4656  --ink-3:#5B6472
--rule:#E6E8EC   --cta:#0062C4
--primary:#0285F7 --primary-soft:#0285F712 --primary-text:#0069C7
--success:#00BD6C --success-soft:#00BD6C14 --success-text:#00804A
--warning:#F5A500 --warning-soft:#F5A50018 --warning-text:#946300
--danger:#EE343B  --danger-soft:#EE343B12  --danger-text:#C4161D
fonte UI: Schibsted Grotesk (342 usos) · display: Newsreader (5 usos: headline/stats/"Entrar")
raios: 6 (kbd/tag), 8 (botão/input), 12 (bolha/composer), 16 (cards), 999 (pills)
bolhas no chat: usuário = ink sólido, cantos [12,12,4,12]; agent = paper + borda rule, [4,12,12,12]
bolhas no console: cliente = paper; agent = #E6EFFA + tag "IA"; humano = #E3F4EA + tag "Suporte N2"; fundo #EEF1F5
```

**Ícones:** todos Lucide → `lucide-react` (bot, headset, hand, arrow-right-left, check-check, lock,
key-round, rotate-ccw-key, send-horizontal, search, eye, log-out, user-round, message-square…).

**Detalhes do protótipo que contam como "fidelidade" e é fácil esquecer:**
- Atalhos de teclado: `1–4` nas opções rápidas, `⌘↵` para confirmar o rascunho.
- Contador de sessão `N/30` sob o composer.
- Prazo concreto no rascunho ("Alta · resposta até 13:43") e no card ("há 5 dias · prazo vencido" em warning).
- Rascunho tem identificador próprio ("Rascunho D-381") e estado "Aguardando confirmação".
- Status line: nome "Nexo Assist" + lista de ações com ícone de check ("consultou seus chamados",
  "buscou na central de ajuda", "classificou a prioridade", "consultou o SLA", "montou o rascunho",
  "consultou o INC-20311", "calculou o prazo").
- Console: badge de não lidas, "digitando…", tag de confiança, "Agent pausado · até 12:05".
- Eventos de sistema centralizados com linhas ("Transferida para Suporte N2 · 10:05").

**Observações/inconsistências no protótipo (decidir e citar no README):**
- O frame "Atendimento assumido" tem 1567px de largura (os outros 1440) — provavelmente acidental.
- Texto do agent: "Encaminhei para o Suporte N2… em até **2 h úteis**" — não bate com a tabela de prazos do
  Anexo A (média = 3 dias úteis). O PRD diz que os dados do protótipo são ilustrativos → **seguir o Anexo A**.
- O protótipo não desenha o **detalhe da decisão** (só a status line). O formato é livre — é aqui que a
  gente se diferencia (§6).
- Não há telas de **loading, erro, sistema de chamados indisponível, limite de 30 atingido, fora de
  escopo** — precisamos criar no mesmo estilo (o critério "Interface" cobra isso).

---

## 3. Requisitos consolidados (checklist)

### Funcionário
- [ ] Login por e-mail corporativo; **qualquer senha** aceita para funcionários do seed
- [ ] Chat com resposta em **streaming**
- [ ] Status line de ações acima de cada resposta + detalhe da decisão (§6)
- [ ] Card de chamado · seletor de chamado · rascunho com Confirmar/Editar/Cancelar · opções rápidas
- [ ] Limite de **30 mensagens por sessão** com contador
- [ ] Conversa persistida: sair, voltar outro dia e continuar
- [ ] Meu perfil (extra do protótipo)

### Agent
- [ ] Tirar dúvida pela central de ajuda (sem abrir chamado)
- [ ] Consultar status sem saber o número (lista → seleção) e dizer se está **vencido**
- [ ] Complementar chamado existente (com confirmação)
- [ ] Abrir chamado: coletar campos faltantes → classificar → **rascunho → confirmação → criar**
- [ ] Sem duplicidade: atualizar o aberto; **reabrir** resolvido há ≤ 7 dias
- [ ] Transferir: a pedido · crítico · vencido · baixa confiança — com **resumo do caso**
- [ ] Escopo: só TI; RH/financeiro/facilities são redirecionados
- [ ] Privacidade: nunca expor chamado de outro funcionário
- [ ] Tolerar indisponibilidade do serviço de chamados

### Analista
- [ ] Lista de conversas com filtros (Todas / Para você / Com o agent / Minhas) e busca
- [ ] Histórico da conversa (cliente, agent, humano, eventos de sistema)
- [ ] Assumir (pausa o agent) · responder · devolver ao agent · encerrar
- [ ] Painel com os chamados do funcionário
- [ ] Atualização em tempo (quase) real da lista e da conversa

### Não funcionais
- [ ] TS estrito, Mastra, LLM justificado, `.env.example`, poucos comandos
- [ ] Persistência de conversas, chamados e **estado da conversa** (agent × analista)
- [ ] Testes onde importam, tratamento de erro, commits que contam a história
- [ ] Custo por conversa consciente
- [ ] Deploy (diferencial) com chave protegida e rate limit

---

## 4. Regras do Anexo A → como viram código

A ideia central (e a principal lição do DeskComm, §7): **o modelo interpreta, o código decide o que é regra.**
Tudo que é regra dura vira função pura testável; o LLM só preenche as entradas.

| Regra | Implementação |
|---|---|
| Tipo INC × REQ | Modelo classifica (com motivo + confiança). Validado por Zod (enum). |
| Categorias (6) | Enum fechado. Modelo escolhe; "Outros" quando incerto. |
| Campos obrigatórios (título, descrição, tipo, categoria, prioridade, afetados) | Tool `build_draft` com schema Zod; se faltar campo, o agent **pergunta** (com opções rápidas) em vez de inventar. |
| **Rascunho antes de criar** | **Garantido pela arquitetura, não pelo prompt:** o agent só tem a tool `build_draft`. Quem cria de fato é o **clique em Confirmar** → API → serviço de chamados. O modelo não tem como criar sem confirmação. |
| Sem duplicidade | Tool `buscar_chamados_do_funcionario` antes de qualquer rascunho; regra determinística: existe aberto na mesma categoria → modelo julga se é o mesmo problema → rascunho de **atualização** em vez de criação. Resolvido há ≤ 7 dias → oferta de **reabrir** (função pura `podeReabrir(ticket, agora)`). |
| **Prioridade = impacto × urgência** | Modelo extrai só `impacto` (eu / equipe / empresa) e `urgencia` (compromisso hoje? há alternativa?). Função pura `calcularPrioridade(impacto, urgencia)` dá Crítica/Alta/Média/Baixa. Cada saída carrega a **regra aplicada** em texto ("Alta: impede uma pessoa de trabalhar com compromisso no mesmo dia"). |
| Prazos (1h / 4h úteis / 3 dias úteis / 5 dias úteis) | Função pura `calcularPrazo(prioridade, desde)` com **horário útil 8h–18h seg–sex**; Crítica conta **corrido** (plantão 24h). Testes unitários cobrindo virada de dia/fim de semana. |
| Vencido | `estaVencido(ticket, agora)` = passou do prazo **desde a última atualização** (o prazo vale para 1ª resposta e para cada atualização). |
| Transferência | Gatilhos determinísticos avaliados **depois** do turno do modelo: pedido explícito (regex PT-BR + intenção), prioridade Crítica, chamado vencido + funcionário aceita, confiança < limiar. Gera **resumo do caso** e muda o estado da conversa para `aguardando_analista`. |
| Agent não responde enquanto está com analista | **Portão no servidor antes de chamar o LLM:** `if (conversa.estado !== 'agent') return` — nem gasta token. |
| Privacidade | Tools **não recebem `funcionarioId` do modelo**: vem do contexto da sessão (cookie). O serviço de chamados também filtra por dono. Teste: Ana pergunta "status do INC de Carla" → nega sem vazar título. |
| Escopo só TI | Classificação de intenção com categoria `fora_de_escopo` → resposta de redirecionamento (RH, financeiro, facilities) com o canal certo. |

---

## 5. Arquitetura proposta

### 5.1 Visão geral

```
┌──────────────────────────── apps/web (Next.js 15/16, App Router) ────────────────────────────┐
│  UI (React)            │  API (Route Handlers)                │  Agent (Mastra, in-process)   │
│  /login                │  POST /api/chat        → stream      │  nexoAgent                    │
│  /atendimento          │  POST /api/rascunhos/:id/confirmar   │   tools ─────────┐            │
│  /perfil               │  GET  /api/conversas (console)       │  regras/ (puras) │            │
│  /console              │  POST /api/conversas/:id/assumir…    │  gatilhos/       │            │
│                        │  GET  /api/eventos  (SSE)            │  trilha/         │            │
└────────────────────────┴──────────────────────────────────────┴──────────────────┼────────────┘
                                                                                   │ HTTP (cliente tipado
                                                                                   │ + retry + disjuntor)
                                                     ┌─────────────────────────────▼─────────────┐
                                                     │ services/tickets (Hono, processo próprio)  │
                                                     │ GET/POST/PATCH /tickets, /transfer         │
                                                     │ falhas simuladas (TICKETS_FAILURE_RATE)    │
                                                     │ banco próprio (SQLite)                     │
                                                     └────────────────────────────────────────────┘
```

**Por que o serviço de chamados é um processo separado:** o PRD pede "separado do agent" e diz que o
sistema é legado e cai. Um processo HTTP próprio torna isso **real e demonstrável** (dá para matar o
processo na entrevista e mostrar a UI tratando), e força um contrato claro. Sobe junto com
`pnpm dev` (via `concurrently`/turbo), então continua "poucos comandos".

### 5.2 Stack recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| Monorepo | pnpm workspaces (`apps/web`, `services/tickets`, `packages/shared`) | Contratos (tipos/Zod) compartilhados, 2 processos, 1 comando |
| Web | Next.js App Router + React + Tailwind 4 + shadcn/ui | Sugestão do PRD; tokens do `.pen` viram `@theme` no CSS |
| Agent | **Mastra** (`@mastra/core`) | Preferência explícita do PRD; tools com Zod, memória e storage prontos, compatível com AI SDK |
| Streaming na UI | AI SDK UI (`useChat`) ligado ao stream do Mastra | Respostas em tempo real + partes customizadas para cards/trilha |
| LLM | **DeepSeek** (`deepseek-chat`) via `@ai-sdk/deepseek` | Custo baixo por conversa; suporta tools e saída JSON. `MODEL_ID` trocável por env |
| Persistência | **Postgres** + Drizzle (schemas `app` e `tickets`); memória do Mastra em `@mastra/pg` | Local: Postgres no `docker compose`. Produção: Supabase (só Postgres) |
| Tempo real (console) | SSE (`/api/eventos`) | Mais simples que WebSocket, suficiente para lista + conversa |
| Auth | Cookie de sessão assinado (iron-session/jose) | Login fake por e-mail do seed; papel `funcionario` × `analista` |
| Testes | Vitest (regras puras, serviço, gatilhos) + evals de cenário com modelo real + 1–2 E2E Playwright | "Testes onde fazem diferença" |
| Deploy | VPS do primare-hub: `docker compose` (web + tickets) atrás do proxy reverso existente; banco no Supabase | Rate limit no `/api/chat` + teto de gasto na conta DeepSeek |

### 5.3 Estrutura de pastas (proposta)

```
desafio-tecnico-nexo-assist/
├─ apps/web/
│  ├─ app/(auth)/login/              # Tela 1
│  ├─ app/(funcionario)/atendimento/ # Telas 2 e 3
│  ├─ app/(funcionario)/perfil/      # Tela 6
│  ├─ app/console/                   # Telas 4 e 5
│  ├─ app/api/...                    # route handlers finos
│  ├─ components/chat/               # Bubble, StatusLine, TicketCard, TicketSelector, DraftCard, QuickReplies, Composer, DecisionPanel
│  ├─ components/console/            # ConversationList, TakeoverBar, TicketHistory, SystemEvent
│  ├─ agent/
│  │  ├─ nexo-agent.ts               # definição Mastra (instruções + tools)
│  │  ├─ tools/                      # search_articles, buscar_chamados, get_ticket, build_draft, transferir…
│  │  ├─ regras/                     # prioridade.ts, prazo.ts, horario-util.ts, reabertura.ts, escopo.ts  (PURAS + testes)
│  │  ├─ gatilhos/                   # transferência (puros + testes)
│  │  ├─ guardrails/                 # promessa-de-analista, vazamento de chamado alheio
│  │  └─ trilha/                     # tipos da decisão + gravação
│  ├─ lib/tickets-client.ts          # cliente HTTP tipado, retry, disjuntor, idempotency key
│  └─ db/                            # schema Drizzle: conversas, mensagens, rascunhos, decisoes, sessoes
├─ services/tickets/                 # Hono + SQLite + seed + falhas simuladas
├─ packages/shared/                  # schemas Zod/tipos: Ticket, Prioridade, Categoria, Status…
├─ evals/                            # cenários das histórias do PRD
├─ referencias/                      # PRD + .pen
└─ README.md
```

### 5.4 Modelo de dados (essencial)

**Serviço de chamados:** `employees`, `tickets (id INC-/REQ-, tipo, titulo, descricao, categoria,
prioridade, afetados, status, dono_id, aberto_em, atualizado_em, prazo_em, resolvido_em)`,
`ticket_events (comentário, mudança de status, transferência)`.

**App web:** `conversas (id, funcionario_id, estado: agent | aguardando_analista | com_analista | encerrada,
analista_id, ticket_foco_id, sessao_atual, mensagens_na_sessao)`, `mensagens (autor: funcionario | agent |
analista | sistema, conteudo, partes/cards JSON)`, `rascunhos (id D-xxx, payload, status: pendente |
confirmado | cancelado, idempotency_key)`, **`decisoes` (a trilha — §6)**, `artigos` (central de ajuda).

**Estado da conversa = máquina de estados explícita** (função pura `transicao(estado, evento)`), com
teste para cada transição válida e inválida:

```
agent ──transferir──▶ aguardando_analista ──assumir──▶ com_analista
  ▲                        │                               │
  └──────devolver──────────┴───────────devolver────────────┘
                                                           └──encerrar──▶ encerrada
```

---

## 6. Transparência — o diferencial (a parte mais importante)

### 6.1 O que gravar em cada turno (`decisoes`)

```ts
type DecisaoDoTurno = {
  turnoId: string;
  entendimento: {           // o que o agent entendeu
    intencao: 'duvida' | 'status' | 'complementar' | 'abrir' | 'falar_com_analista' | 'fora_de_escopo' | 'outro';
    resumo: string;         // "Notebook não conecta na VPN, erro 809, Windows 11"
    evidencia: string;      // trecho da fala do funcionário que sustenta (entre aspas, nunca parafraseado)
  };
  acoes: Array<{            // o que fez — vira a status line
    rotulo: string;         // "consultou seus chamados"
    ferramenta: string;     // buscar_chamados
    resultado: 'ok' | 'erro' | 'tentou_de_novo';
    duracaoMs: number;
    resumo: string;         // "3 abertos, nenhum sobre VPN"
  }>;
  decisao: {
    acao: 'responder' | 'perguntar' | 'rascunho_criar' | 'rascunho_atualizar' | 'reabrir' | 'transferir' | 'redirecionar';
    confianca: number;      // 0–1
    porque: string;         // linguagem humana
    regrasAplicadas: string[]; // ["Anexo A · Alta: compromisso no mesmo dia (prazo 4h úteis)", "Sem duplicidade: nenhum aberto em Rede e VPN"]
    fontes: Array<{ tipo: 'artigo' | 'chamado'; id: string; titulo: string }>;
  };
  custo: { modelo: string; tokensEntrada: number; tokensSaida: number; usd: number; latenciaMs: number };
};
```

- **Ações** saem das tool calls reais (não do texto do modelo) — impossível o agent "dizer" que consultou
  algo que não consultou.
- **Entendimento + decisão + confiança + porquê** saem de uma **saída estruturada obrigatória no
  fechamento do turno** (schema Zod), não de uma tool opcional — ideia direta do DeskComm (§7.1).
- **Regras aplicadas** vêm das funções puras (cada uma devolve o resultado **e** a frase da regra).

### 6.2 Como mostrar

1. **Status line** (igual ao protótipo): "Nexo Assist · ✓ consultou seus chamados · ✓ buscou na central".
   Durante o streaming, cada ação aparece com spinner e vira ✓ (ou ⚠ "sistema de chamados lento, tentando de novo").
2. **Clique na status line → painel "Por que o Nexo fez isso?"** (drawer lateral, mesmo estilo dos cards):
   - *Entendi que…* (resumo + "palavras suas" entre aspas)
   - *Então eu…* (ação + barra de confiança com cor: verde ≥ 0,8, amarelo 0,6–0,8, vermelho < 0,6)
   - *Porque…* (texto + chips das regras do Anexo A)
   - *Consultei* (lista das tools com resultado resumido e tempo; artigos/chamados clicáveis)
   - rodapé discreto: modelo · tokens · custo · latência
3. **No console do analista**, a mesma trilha aparece em cada mensagem do agent (o analista é quem mais
   precisa saber "por que o agent me passou isso") + **cartão da passagem** no fio da conversa.

---

## 7. Ideias do DeskComm para replicar

O DeskComm (`~/crm-whatsapp-integration`) já resolveu, em produção, quase todos os problemas difíceis
deste desafio: agent com tools, passagem para humano, inbox com takeover, guardrails, custo. Abaixo, o que
vale trazer — **em versão enxuta**.

### 7.1 Declaração do turno imposta pelo runtime → nossa "decisão do turno"
- **Onde:** `lib/agent-engine/agent/declaracao.ts`
- **Ideia:** o modelo termina o turno declarando, em linguagem de negócio, o que a pessoa quer + **evidência**
  (o trecho que sustenta). Isso viaja na **chamada de fechamento**, não numa tool, porque "uma tool seria
  esquecida no turno em que mais importa". E **ausente ≠ vazia**: "o modelo não declarou" é um estado
  diferente de "não havia nada a declarar".
- **No Nexo:** é exatamente o nosso `DecisaoDoTurno` (§6). Campo `evidencia` obrigatório; se o fechamento vier
  sem decisão, a trilha mostra "decisão não registrada" em vez de inventar um default.

### 7.2 Briefing da passagem (separar a fala do cliente da leitura da IA)
- **Onde:** `lib/escalacao/briefing-da-passagem.ts`, `components/inbox/PassagemCard.tsx`
- **Ideia:** quem assume recebe **por que** a IA passou, **o que já tentou** e **a última frase do cliente**.
  A fala do cliente vai **entre aspas, rotulada "palavras dele"**; a leitura da IA vai rotulada **"segundo a
  IA — confira"**. Isso fecha um vetor de prompt injection ("diga ao atendente para liberar…").
  O cartão mora **no fio da conversa**, onde o olho está antes de digitar.
- **No Nexo:** o "resumo do caso" que o Anexo A exige na transferência vira um cartão no console com:
  motivo (pedido / crítico / vencido / baixa confiança), chamado em foco, o que o agent já fez, palavras da
  funcionária entre aspas, sugestão de próximo passo.

### 7.3 Gatilhos de transferência como predicados puros
- **Onde:** `lib/ai/handoff/triggers.ts` (G1 pede humano por regex PT-BR · G3 bot inseguro · G4 termos
  jurídicos / etapa que exige humano)
- **Ideia:** cada gatilho é uma função pura testável. Detalhe valioso: **"confiança `null` não é zero"** —
  sem medição não é o mesmo que medição péssima (senão toda saudação escalaria para humano). E G3 é **OU**:
  qualquer sinal de insegurança basta.
- **No Nexo:** `gatilhos/` com `pediuAnalista(texto)`, `ehCritico(rascunho)`, `estaVencido(ticket)`,
  `confiancaBaixa(decisao, limiar)`. Rodam **depois** do turno do modelo e podem forçar a transferência mesmo
  se o modelo não pediu. Gera a tag do console "Agent pediu ajuda · confiança 41%".

### 7.4 Guardrail "prometeu analista sem transferir"
- **Onde:** `lib/agent-engine/guardrails/human-promise.ts` + cadeia `before-send.ts`
- **Ideia:** detector determinístico (regex conservadora) que pega o modelo **prometendo envolver um humano**
  ("vou encaminhar para a equipe…") sem ter aberto o caso. A mensagem é vetada e a razão volta ao modelo como
  erro instrutivo.
- **No Nexo:** se o texto final promete analista e o estado não virou `aguardando_analista`, ou a gente
  executa a transferência ou reescreve. Mesmo esquema para **"disse que criou o chamado" sem chamado criado**
  — alucinação de ação é exatamente o que a banca vai tentar provocar.

### 7.5 Disjuntor (circuit breaker) para o sistema legado
- **Onde:** `lib/ai/decisao/disjuntor.ts`
- **Ideia:** 3 falhas seguidas abrem por N minutos; respeita `retry-after`; estado em memória porque reiniciar
  custa no máximo uma tentativa a mais.
- **No Nexo:** `tickets-client.ts` com **retry com backoff curto** (a queda é "de alguns segundos") +
  disjuntor. Com o disjuntor aberto, o agent **diz a verdade** ("o sistema de chamados está fora agora; guardei
  seu rascunho e tento de novo") e a UI mostra o estado. Ótimo para demonstrar ao vivo.

### 7.6 Idempotência na criação
- **Onde:** `lib/api/idempotency.ts` (header `Idempotency-Key`, recibo persistido)
- **Ideia:** retry de POST não pode duplicar efeito.
- **No Nexo:** o rascunho D-xxx carrega uma `idempotency_key`; o serviço de chamados guarda o recibo. Retry
  após timeout (o legado cai!) **nunca** gera dois chamados — e "sem duplicidade" é regra do Anexo A.

### 7.7 Identidade de fonte confiável, nunca do body
- **Onde:** convenção de multi-tenancy do `CLAUDE.md` do DeskComm ("`organization_id` resolvido de
  cookie/JWT, **NUNCA do body**")
- **No Nexo:** `funcionarioId` vem da sessão; as tools do Mastra recebem via `runtimeContext`, **não como
  parâmetro que o modelo preenche**. Assim, nem um prompt injection consegue consultar chamado alheio.

### 7.8 Custo por chamada registrado e visível
- **Onde:** `lib/ai/usage/registrar-chamada.ts`, `llm_calls`, `lib/ai/budget/`
- **No Nexo:** cada turno grava modelo/tokens/custo/latência na trilha; README mostra **custo médio por
  conversa** medido nos evals. Portão de pausa (agent com analista = zero tokens) e limite de 30 mensagens
  também entram na conta.

### 7.9 Sondas com IA real (evals)
- **Onde:** `tests/sonda-ia-real.ts`, `tests/sonda-decisao-*.ts`
- **No Nexo:** `evals/` com um cenário por história do PRD (VPN 809 Win10 × Win11, status sem número, chamado
  vencido, pedir analista, duplicado, reabrir ≤ 7 dias, chamado de outra pessoa, pergunta de RH, prompt
  injection). Cada cenário verifica **ações** (tools chamadas), **decisão** e **regras** — não o texto exato.
  Resultado vira uma tabela no README ("como garanti a qualidade das decisões" é seção obrigatória).

### 7.10 Separação agent × serviço externo (molde do `agent-engine`)
- **Onde:** `lib/agent-engine/PORT-NOTES.md`, `lib/agent-engine/edge/{crm,llm,channel}`,
  `lib/agent-engine/edge/crm/mcp-client.ts` (`CrmTransportError`), `Dockerfile.worker` + serviço `worker`
  no `docker-compose.yml`.
- **Como é lá:** o agent nasceu como daemon separado (Vendaval) falando com o CRM por MCP/HTTP. Depois da
  fusão passou a dividir repo e banco, mas manteve: (1) **processo próprio** — container `worker` com
  `/healthz` publicado só em `127.0.0.1`; (2) **núcleo auto-contido** — `lib/agent-engine/` não importa
  nada do app, só fala com o mundo pelas **bordas** `edge/*`; (3) **erro de transporte é transitório** —
  `CrmTransportError` faz o job tentar de novo e nunca vira mensagem ao cliente.
- **No Nexo:** `services/tickets` (Hono) em container próprio com `/healthz`; tabelas no schema `tickets`
  do mesmo Postgres (só o serviço escreve nele); `apps/web/agent/` só alcança chamados por
  `edge/tickets.ts` (cliente HTTP tipado + retry curto + disjuntor + `Idempotency-Key`), que lança
  `TicketsTransportError` quando o legado cai — o agent traduz isso para um aviso honesto e guarda o rascunho.

### O que **não** trazer do DeskComm
- Multi-tenant/RLS, WAHA, Supabase, event_log + workers, i18n, MCP server — fora do escopo, só aumentaria a
  superfície para mudanças ao vivo.
- Comentários-ensaio longos: no Nexo, comentário curto explicando o **porquê**; o raciocínio maior vai para o
  README e para os ADRs curtos.

---

## 8. Fluxos principais (como o agent age)

**Abrir chamado (Tela 2)**
1. Funcionária: "Notebook não conecta na VPN, erro 809".
2. Tools: `buscar_chamados` (nenhum aberto sobre VPN) → `search_articles` (artigo 809 só Win10).
3. Falta SO / afetados → pergunta com **opções rápidas** (Só eu / Minha equipe / Toda a empresa / Não sei).
4. Resposta: "Só eu, reunião às 14h" → modelo extrai impacto=individual, urgência=compromisso hoje →
   `calcularPrioridade` = **Alta** → `calcularPrazo` = 4h úteis → `build_draft`.
5. UI mostra **DraftCard** "Aguardando confirmação" → clique **Confirmar** → API → serviço (com idempotency) →
   mensagem de sistema "INC-20517 criado" + card do chamado.

**Consultar status (Tela 3)**
1. "Qual o status do meu chamado?" → `buscar_chamados` → 3 abertos → **TicketSelector**.
2. Seleção → `get_ticket` + `estaVencido` → **TicketCard** "há 5 dias · prazo vencido".
3. Vencido → gatilho oferece analista (Falar com analista / Adicionar informação / Não, obrigado).

**Transferir (Telas 4 e 5)**
1. "Quero falar com um analista" → gatilho `pediuAnalista` → `transferir` (serviço) + estado
   `aguardando_analista` + **briefing** → evento de sistema no fio.
2. Console: aparece em "Para você" com tag vermelha. Analista clica **Assumir** → `com_analista`, evento
   "Rafael Lima assumiu · agent pausado".
3. Mensagens da funcionária agora vão ao analista; **o agent não é chamado** (portão no servidor).
4. **Devolver ao agent** (volta a `agent`, com nota do que o analista fez no contexto) ou **Encerrar**.

**Fora de escopo / dúvida simples:** resposta direta com fonte (artigo citado) e sem chamado.

---

## 9. Pontos em aberto (decidir antes de codar)

| # | Questão | Minha recomendação |
|---|---|---|
| 1 | O que acontece ao bater 30 mensagens? | ✅ **Decidido:** o agent oferece/transfere para um analista com o resumo do caso |
| 2 | Quem cria de fato o chamado? | O **clique em Confirmar** (API), nunca o modelo. "Editar" reabre os campos no card (form inline) |
| 3 | Como medir "confiança"? | Autodeclarada pelo modelo no fechamento + ajustada por sinais determinísticos (artigo encontrado? campos completos? intenção clara?). Limiar de transferência configurável (ex.: 0,6) |
| 4 | Central de ajuda: busca semântica ou texto? | 5–10 artigos cabem em busca simples (palavras-chave/BM25) ou até no contexto. Embeddings seriam over-engineering — justificar no README |
| 5 | N1 × N2 | Transferência vai para fila única com rótulo de nível (N2 para crítico/vencido, N1 para o resto); analista de seed: Rafael Lima (N2) + 1 de N1 |
| 6 | Tempo real no console | SSE; fallback polling 3s |
| 7 | Fuso/horário útil | America/Sao_Paulo, 8h–18h seg–sex, sem feriados (citar como trade-off) |
| 8 | Modelo | ✅ **Decidido:** DeepSeek (`deepseek-chat`); medir custo por conversa nos evals |
| 9 | Deploy | ✅ **Decidido:** VPS do primare-hub (docker compose) + Supabase como Postgres. Proxy = Caddy, recursos sobram, domínio `nexo.primarehub.com.br` (§10.1). ⏳ Criar registro A no Registro.br |

---

## 10. Plano de execução (fases)

### Plano de 3 dias (prazo definido)

| Dia | Manhã | Tarde |
|---|---|---|
| **1** | Monorepo + docker compose (Postgres) + tokens do `.pen` · regras puras com testes (prioridade, prazo útil, vencido, reabertura, máquina de estados, gatilhos) | Serviço de chamados (Hono, seed, falhas simuladas, idempotência) + `edge/tickets` com retry/disjuntor · login/sessão |
| **2** | Agent Mastra + DeepSeek: tools, decisão do turno estruturada, gravação da trilha, portão de pausa | Chat: streaming, status line, cards (chamado, seletor, rascunho), opções rápidas, contador 30 → oferta de analista · **painel "Por quê?"** |
| **3** | Console do analista: lista/filtros, cartão da passagem, assumir/devolver/encerrar, chamados do funcionário, SSE | Guardrails (promessa de analista, ação alucinada, privacidade, escopo) · evals mínimos · estados de erro · README · deploy na VPS |

**Cortes já assumidos para caber em 3 dias:** "Meu perfil" só leitura · busca do console simples (filtro no
cliente) · E2E Playwright fica de fora (evals + unitários cobrem) · atalhos de teclado só se sobrar tempo.

### 10.1 Deploy na VPS do primare-hub (levantamento de 2026-11-03)

**O que já roda lá** (`/opt/cliniai`, projeto compose `cliniai`, domínio `app.primarehub.com.br`):

| Container | RAM em uso / limite |
|---|---|
| app (DeskComm 2.0.0) | 312 MB / 768 MB |
| worker | 158 MB / 512 MB |
| waha | 724 MB / 1,25 GB |
| srh, caddy, redis, scheduler | ~90 MB somados |

Máquina: 2 vCPU, 3,8 GB RAM (~2,0 GB disponíveis + 2 GB de swap quase sem uso), disco 98 GB com 78 GB livres,
load ~0,05. Caddy 2 (container `cliniai-caddy-1`) termina HTTPS nas portas 80/443, Caddyfile em
`/opt/cliniai/Caddyfile`, rede `cliniai_internal`.

**Cabe com folga:** o Nexo precisa de ~400 MB (web ~250–300 MB + tickets ~80 MB); banco e LLM ficam fora.

**Como plugar sem arriscar o primare-hub:**
1. **Não buildar na VPS** — `next build` pede 1,5–2 GB e disputaria memória com o WAHA. Build das imagens
   no GitHub Actions → GHCR (mesmo padrão `ghcr.io/guiwustro/...` do DeskComm); a VPS só faz `pull`.
2. **Compose separado** em `/opt/nexo` (projeto `nexo`), com **limite de memória** em cada container
   (web 384 MB, tickets 128 MB) — o Nexo nunca consegue sufocar o primare-hub.
3. **Rede:** os containers do Nexo entram na rede `cliniai_internal` como `external`, só para o Caddy
   alcançá-los.
4. **Caddy:** um bloco novo no Caddyfile (`nexo.<domínio> { reverse_proxy nexo-web:3000 }`) + `caddy reload`
   (sem derrubar o primare-hub). Certificado sai automático.
5. **DNS:** domínio **`nexo.primarehub.com.br`** (decidido). DNS do `primarehub.com.br` está no
   **Registro.br** (`a.sec.dns.br`/`b.sec.dns.br`); criar registro **A `nexo` → `143.95.175.62`**
   (o `app` já aponta para o mesmo IP).
6. **Proteção:** rate limit no `/api/chat`, teto de gasto na conta DeepSeek, `.env` só na VPS.

### Plano completo (referência)

| Fase | Entrega | Commits que contam a história |
|---|---|---|
| 0 | Monorepo, TS estrito, lint, Vitest, `.env.example`, tokens do `.pen` em CSS | `chore: estrutura do monorepo` · `feat(ui): tokens do protótipo` |
| 1 | **Regras puras + testes** (prioridade, prazo útil, vencido, reabertura, máquina de estados, gatilhos) | `feat(regras): prioridade e prazos do Anexo A` … |
| 2 | **Serviço de chamados** (Hono + SQLite + seed + falhas simuladas) e cliente tipado com retry/disjuntor/idempotência | `feat(tickets): serviço simulado` · `feat(tickets): instabilidade e retry` |
| 3 | Login + sessão + layout funcionário (sidebar/topbar) + Meu perfil | `feat(web): login e sessão` |
| 4 | **Agent Mastra** com tools + saída estruturada da decisão + persistência da trilha | `feat(agent): tools e decisão do turno` |
| 5 | Chat com streaming, status line, cards (ticket, seletor, rascunho), opções rápidas, atalhos, contador 30 | `feat(chat): ...` |
| 6 | **Painel "Por que?"** (transparência) | `feat(chat): painel de decisão` |
| 7 | Transferência + console do analista (lista/filtros/busca, takeover, devolver, encerrar, chamados do funcionário, SSE) | `feat(console): ...` |
| 8 | Guardrails (promessa de analista, ação alucinada, privacidade, escopo) | `feat(agent): guardrails` |
| 9 | Evals de cenário + estados de loading/erro/instabilidade/limite | `test(evals): histórias do PRD` |
| 10 | README completo + deploy com rate limit e chave protegida | `docs: README` · `chore: deploy` |

**Ordem pensada para risco:** regras e serviço primeiro (são a base testável e não dependem de LLM), agent
depois, UI por último sobre contratos estáveis. Se o tempo apertar, cortar nesta ordem: Meu perfil → busca do
console → atalhos de teclado → SSE (vira polling). **Nunca cortar:** transparência, confirmação antes de criar,
privacidade, pausa do agent.

---

## 11. README — esqueleto já alinhado ao que o PRD pede

1. Como rodar (`pnpm i && pnpm dev`, `.env.example`, usuários do seed)
2. Visão geral da arquitetura (diagrama §5.1)
3. Como o agent decide o que fazer (modelo interpreta × código decide; tools; gatilhos)
4. Como garanti a qualidade das decisões (testes das regras + evals com tabela de resultados)
5. Transparência (trilha de decisão, como ler o painel)
6. Escolha do modelo e custo por conversa (medido)
7. Principais trade-offs (SQLite, busca simples, horário útil sem feriados, sessão de 30)
8. O que faria com mais tempo
9. Deploy (como, onde, proteção da chave, rate limit)

---

## 12. Arquitetura detalhada — no molde do DeskComm

> Levantado no DeskComm (`~/crm-whatsapp-integration`): `supabase/baseline.sql`, migrations 0050 (agent harness)
> e 0291 (passagens), `app/api/v1/conversations/*`, `lib/api/wrappers.ts`. A regra foi: **mesmo vocabulário,
> mesmas convenções, metade do tamanho** — sem multi-tenant (não há organizações no desafio).

### 12.1 Estrutura do repositório (igual ao DeskComm: app Next na raiz + processos extras com Dockerfile próprio)

```
desafio-tecnico-nexo-assist/
├─ app/                          # Next.js App Router (páginas + /api/v1/*)
│  ├─ (auth)/login/
│  ├─ (funcionario)/atendimento/  (funcionario)/perfil/
│  ├─ console/
│  └─ api/v1/...                 # route handlers finos (Zod → guard → lib → ok/fail)
├─ components/                   # ui/ (shadcn), chat/, console/
├─ lib/
│  ├─ api/wrappers.ts            # ok() / fail() + X-Request-Id          (DeskComm: lib/api/wrappers.ts)
│  ├─ api/idempotency.ts         # Idempotency-Key                       (DeskComm: lib/api/idempotency.ts)
│  ├─ auth/                      # sessão (cookie assinado), requireRole (DeskComm: lib/auth)
│  ├─ audit/                     # audit() fire-and-forget              (DeskComm: lib/audit)
│  ├─ event-log/                 # emitir/ler eventos (alimenta o SSE)   (DeskComm: lib/event-log)
│  ├─ db/                        # Drizzle: schema + client
│  ├─ env.ts                     # env validado por Zod                  (DeskComm: lib/env.ts)
│  └─ agent-engine/              # núcleo AUTO-CONTIDO do agent          (DeskComm: lib/agent-engine)
│     ├─ agent/                  # nexo-agent.ts (Mastra), turno, declaração do turno, histórico
│     ├─ regras/                 # prioridade, prazo útil, vencido, reabertura (puras)
│     ├─ gatilhos/               # transferência (puros)                (DeskComm: lib/ai/handoff/triggers.ts)
│     ├─ guardrails/             # before-send: promessa de analista, ação alucinada, vazamento
│     └─ edge/                   # ÚNICA saída para o mundo              (DeskComm: lib/agent-engine/edge/*)
│        ├─ tickets/             # cliente HTTP + retry + disjuntor + TicketsTransportError
│        └─ llm/                 # run-model-call: DeepSeek + registro em llm_calls
├─ services/tickets/             # serviço de chamados (Hono)           (DeskComm: worker em processo próprio)
├─ db/migrations/                # SQL versionado (drizzle-kit)
├─ tests/unit/  tests/invariants/   evals/
├─ Dockerfile  Dockerfile.tickets  docker-compose.yml (local)  docker-compose.prod.yml
└─ referencias/  ANALISE.md  README.md
```

> Mudança em relação à §5.3: **sem monorepo pnpm**. O DeskComm resolve "processo separado" com um Dockerfile a
> mais na mesma base de código (`Dockerfile.worker`), e é isso que replicamos com `Dockerfile.tickets`.

### 12.2 Convenções copiadas do DeskComm

| Convenção | No DeskComm | No Nexo |
|---|---|---|
| API versionada | `/api/v1/*` | igual |
| JSON | snake_case, UUID v4, ISO-8601 UTC | igual (+ `code` legível: `INC-20311`, `D-381`) |
| Envelope | `{ data, meta? }` / `{ error: { code, message, details? } }` via `ok()`/`fail()` | igual |
| Correlação | `X-Request-Id` em toda resposta | igual |
| Validação | Zod em todo input externo e no env | igual |
| Identidade | `organization_id` de fonte confiável, **nunca do body** | `user_id` da sessão, nunca do body nem do modelo |
| Papéis | `viewer < agent < manager < admin` + `requireRole()` | `employee` e `analyst` + `requireRole()` |
| Idempotência | `Idempotency-Key` + tabela `idempotency_keys` (24h) | igual, na confirmação do rascunho e no serviço de chamados |
| Auditoria | `api_audit_log` em toda mutação, fire-and-forget | igual (sem a parte de retenção/LGPD) |
| Eventos | `event_log`, `event_type` no formato `dominio.acao` | igual — e o **SSE do console lê daqui** (sem workers) |
| Status | `text` + `CHECK` (não enum do Postgres) | igual |
| Health | `/ping` (app) e `/healthz` (worker) | `/ping` (web) e `/healthz` (tickets) |
| Rotas internas | `x-internal-secret` em `/api/internal/*` | serviço de chamados exige `x-internal-secret` |

**Não copiamos:** RLS/multi-tenant, Supabase Auth/Realtime/Storage, WAHA, workers/cron, LGPD, MCP, i18n.

### 12.3 Tabelas — schema `public` (app web)

Nomes em inglês como as tabelas centrais do DeskComm; vocabulário de status **igual ao DeskComm**.

**`users`** — funcionários e analistas (seed)
`id uuid pk` · `email text unique` · `name text` · `role text check (employee|analyst)` · `department text`
(ex.: Financeiro) · `support_level text null check (N1|N2)` · `created_at`

**`conversations`** — uma por funcionário (a "conversa contínua"); espelha `public.conversations` do DeskComm
`id` · `employee_id → users` · `status text check (ai_handling|pending|claimed|closed)` *(mesmos nomes do DeskComm:
ai_handling = com o agent, pending = aguardando analista, claimed = analista atendendo)* · `status_changed_at` ·
`assigned_to_user_id → users null` · `assigned_at` · `focus_ticket_code text null` · `last_message_at` ·
`last_message_preview` · `unread_count_for_assignee int` · `session_message_count int` (contador dos 30) ·
`session_started_at` · `summary text null` (resumo para o agent e para a passagem) · `last_handoff_at` ·
`last_handoff_reason` · `metadata jsonb` · `created_at` · `updated_at`

**`messages`** — espelha `public.messages`
`id` · `conversation_id` · `direction text check (inbound|outbound)` · `type text check (text|system)` ·
`sent_via text check (user|ai|system)` *(mesmos valores do DeskComm)* · `sent_by_user_id null` · `body text` ·
`parts jsonb` (cards: `ticket_card`, `ticket_selector`, `draft_card`, `quick_replies`) · `agent_run_id null` ·
`metadata jsonb` · `created_at`

**`ai_agent_runs`** — um por turno do agent; espelha `public.ai_agent_runs` **+ a decisão do turno**
`id` · `conversation_id` · `inbound_message_id` · `outbound_message_id` · `status text check
(running|completed|failed|aborted|handoff)` · `error_code` · `error_message` · `tokens_in` · `tokens_out` ·
`cost_cents numeric null` *(null = preço desconhecido, nunca 0 — regra do DeskComm)* · `latency_ms` · `steps_count` ·
`tool_calls jsonb` (ações: rótulo, ferramenta, resultado, duração, resumo) · **`decision jsonb null`**
(entendimento + evidência + ação + confiança + porquê + regras + fontes — §6; *null = "não declarou", ≠ vazia*) ·
`started_at` · `completed_at`

**`llm_calls`** — uma por chamada de modelo; espelha `llm_calls` da migration 0050
`id` · `agent_run_id null` · `purpose text` (`agent_turn`|`summary`) · `provider` · `model` · `input_tokens` ·
`output_tokens` · `cache_read_tokens` · `cost_cents null` · `latency_ms` · `created_at`

**`ticket_drafts`** — o rascunho "D-381" que só vira chamado com o clique
`id` · `code text unique` (D-381) · `conversation_id` · `agent_run_id` · `kind text check (create|update|reopen)` ·
`target_ticket_code null` · `payload jsonb` (título, descrição, tipo, categoria, prioridade, afetados, prazo, regra
aplicada) · `status text check (pending|confirmed|cancelled|failed)` · `idempotency_key uuid` ·
`result_ticket_code null` · `error_code null` · `created_at` · `decided_at`

**`handoffs`** — espelha `passagens_de_atendimento` (0291), enxuta
`id` · `conversation_id` · `ticket_code null` · `origin text check (explicit_request|trigger|model_tool|session_limit)` ·
`reason_code text check (requested_human|critical_priority|overdue_ticket|low_confidence|session_limit)` ·
`support_level text check (N1|N2)` · `title` · `body text not null` (briefing: palavras do funcionário entre
aspas + "segundo o agent — confira") · `attempts jsonb` (o que o agent já tentou) · `created_at` ·
`acknowledged_by → users null` · `acknowledged_at null` *(mesmo check de coerência do DeskComm)*

**`knowledge_articles`** — central de ajuda; inspirada em `ai_faq_items`
`id` · `slug unique` · `title` · `body` · `tags text[]` · `applies_to text null` (ex.: "Windows 10") · `created_at`

**`event_log`** · **`api_audit_log`** · **`idempotency_keys`** — mesmas colunas do DeskComm, sem
`organization_id`/RLS. Eventos previstos: `conversation.message_created`, `conversation.transferred`,
`conversation.claimed`, `conversation.released`, `conversation.closed`, `draft.created`, `draft.confirmed`,
`ticket.created`, `ticket.updated`.

### 12.4 Tabelas — schema `tickets` (só o serviço de chamados escreve)

**`tickets.tickets`**
`id uuid` · `code text unique` (INC-20311 / REQ-10442) · `type text check (incident|request)` · `title` ·
`description` · `category text check (access|network_vpn|hardware|software|email|other)` · `subcategory null`
(ex.: Notebook) · `priority text check (critical|high|medium|low)` · `affected text check (me|team|company)` ·
`status text check (open|in_progress|awaiting_analyst|approved|resolved|closed)` · `requester_id uuid`
(**sem FK** para `public.users`: é outro sistema, como um legado de verdade) · `assignee_name null` ·
`due_at` (prazo da próxima resposta) · `last_update_at` · `resolved_at null` · `created_at`

**`tickets.ticket_events`** — `id` · `ticket_id` · `kind text check (created|comment|status_changed|
transferred|reopened)` · `body` · `actor text` · `created_at`

**`tickets.idempotency_keys`** — recibo do serviço (mesma forma da tabela do app).

### 12.5 Endpoints — app web (`/api/v1`, cookie de sessão)

| Método | Rota | Quem | O que faz | Espelha no DeskComm |
|---|---|---|---|---|
| POST | `/auth/login` | público | e-mail do seed + qualquer senha → cookie | — |
| POST | `/auth/logout` | logado | limpa cookie | — |
| GET | `/me` | logado | usuário da sessão | — |
| GET | `/conversations/current` | employee | conversa do funcionário (cria se não houver) | `open-with-contact` |
| GET | `/conversations/:id/messages` | dono ou analyst | histórico paginado (cursor) | `[id]/messages` |
| POST | `/conversations/:id/messages` | dono ou analyst | funcionário: **roda o turno do agent em stream** (se `ai_handling`); analista: envia resposta (se `claimed` por ele) | `[id]/messages` |
| PATCH | `/drafts/:id` | dono | editar campos do rascunho | `[id]/drafts` |
| POST | `/drafts/:id/confirm` | dono | cria/atualiza/reabre no serviço (`Idempotency-Key`) | `[id]/drafts/consume` |
| POST | `/drafts/:id/cancel` | dono | cancela | — |
| GET | `/ai/runs/:id` | dono ou analyst | detalhe da decisão (painel "Por quê?") | `/ai/runs` |
| GET | `/conversations` | analyst | lista com `filter=all\|for_you\|with_agent\|mine` e `q=` | `/conversations` |
| GET | `/conversations/counts` | analyst | contadores dos filtros | `/conversations/counts` |
| POST | `/conversations/:id/claim` | analyst | assumir (pausa o agent) | `[id]/claim` |
| POST | `/conversations/:id/release` | analyst | devolver ao agent | `[id]/release` |
| POST | `/conversations/:id/close` | analyst | encerrar | `[id]/close` |
| GET | `/conversations/:id/handoffs` | analyst | briefings da passagem | `[id]/passagens` |
| GET | `/employees/:id/tickets` | analyst | painel "Chamados da Ana" (via borda de tickets) | — |
| GET | `/events` | logado | **SSE** lendo `event_log` (filtrado por papel/dono) | Realtime |
| GET | `/ping` | público | health | `/ping` |

### 12.6 Endpoints — serviço de chamados (Hono, rede interna, `x-internal-secret`)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/healthz` | health (publicado só na rede interna) |
| GET | `/tickets?requester_id=&status=` | chamados de um funcionário |
| GET | `/tickets/:code?requester_id=` | um chamado — **404 se não for do solicitante** (privacidade também no serviço) |
| POST | `/tickets` | cria (`Idempotency-Key` obrigatório) |
| PATCH | `/tickets/:code` | complementa/atualiza (`Idempotency-Key`) |
| POST | `/tickets/:code/reopen` | reabre (só se resolvido há ≤ 7 dias) |
| POST | `/tickets/:code/transfer` | marca transferência para N1/N2 |
| POST | `/_chaos/outage?seconds=10` | derruba o serviço de propósito (demo da instabilidade; desligado em produção por env) |

Falhas aleatórias controladas por env: `TICKETS_FAILURE_RATE` (ex.: 0.1) e `TICKETS_OUTAGE_SECONDS`.
Mesmo envelope `{ data } / { error }` do app.
