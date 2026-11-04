# Nexo Assist — passagem de sessão (2026-11-03)

> Leia este arquivo inteiro antes de mexer em qualquer coisa. Ele substitui a memória da sessão anterior.
> Plano: `docs/superpowers/plans/2026-11-03-nexo-assist.md` · Spec: `ANALISE.md` + `referencias/` (PRD em PDF e protótipo `nexo.pen`).

---

## 0. Atualização de 2026-11-04 (leia primeiro)

- **Tasks 23, 24 e 27 completas** (ledger). Evals 39/39 com `deepseek-flash`; README pronto; revisão final do branch
  feita por um revisor novo (6 Important + README corrigidos com teste antes; Minor adiados no ledger como
  `Final: minor (deferred)`).
- **Task 25 pendente só do Step 3:** criar o repo público no GitHub, push e CI verde. Smoke e E2E já passam
  (o E2E quebrado era a rota de reset em pasta privada `_test` → agora `/api/v1/e2e/reset`).
- **Task 26 pendente:** deploy na VPS, todo passo confirmado com o Gui. Antes: gerar `SESSION_SECRET` novo,
  preencher `LLM_PRICE_*` se usar `LLM_DAILY_BUDGET_CENTS` (sem eles o app não sobe) e decidir se a URL pública
  precisa de alguma barreira (qualquer senha entra como analista).
- Testes no HEAD: unit 230/230, integração 96/96, E2E 28/28, typecheck/lint limpos.
- Workspace `.superpowers/sdd/2026-11-03-nexo-assist/` **não foi apagado** (plano ainda aberto). Depois da Task 26:
  apagar e usar superpowers:finishing-a-development-branch.

## 1. Como retomar (copie isto na nova sessão)

```
Continue a execução do plano docs/superpowers/plans/2026-11-03-nexo-assist.md usando a skill
superpowers:executing-plans (inline, sem subagentes por task). Leia antes docs/superpowers/HANDOFF.md.
As Tasks 0–22 estão completas e commitadas; retome na Task 23. O ledger está em
.superpowers/sdd/2026-11-03-nexo-assist/progress.md.
```

Passos que a skill exige e que já estão prontos:

- **Ledger:** `.superpowers/sdd/2026-11-03-nexo-assist/progress.md` (git-ignored, existe no disco). Toda task com linha `Task N: complete` está feita — **não refazer**. A primeira sem essa linha é a **Task 23**.
- **Scripts da skill** (em `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/`):
  - início de task: `executing-plans/scripts/task-start <plano> <N>` → imprime o brief e o BASE.
  - fim de task: `executing-plans/scripts/task-done <plano> <N> <BASE> -- <comando de teste>` → roda os testes e só grava `Task N: complete` no ledger se passarem.
  - revisão final: `subagent-driven-development/scripts/review-package <plano> <merge-base> HEAD`.
- **Regras da skill que valem:** TDD (teste falha antes, passa depois), toda divergência do plano vira linha `Task N: Ruling: … — por quê — custo se errado` no ledger, commit em Conventional Commits terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Só parar para perguntar** em: ação irreversível, segurança, efeito fora do repo (push, criar repo público, deploy na VPS, gastar dinheiro com API). As Tasks 23, 25 e 26 têm passos assim — ver §8.

---

## 2. Estado atual

| Item | Valor |
|---|---|
| Branch | `main` (repo criado do zero na Task 0; **sem remote**, nada foi enviado ao GitHub) |
| HEAD | `6fdcbdd test(e2e): instabilidade do legado, limite de sessão e continuidade` |
| Working tree | limpo (só este arquivo novo, se ainda não commitado) |
| Tasks completas | **0 a 22** |
| Tasks pendentes | **23** (evals com modelo real), **24** (rate limit / orçamento / headers), **25** (Docker, CI, smoke), **26** (deploy na VPS), **27** (README e revisão final) |
| Revisão final do branch inteiro | **ainda não feita** (é o último passo da skill, depois da Task 27) |

### Resultado dos testes no HEAD (rodados nesta sessão)

| Camada | Comando | Resultado |
|---|---|---|
| Typecheck + lint | `pnpm typecheck && pnpm lint` | 0 erros, 0 warnings |
| Unitários | `pnpm test` | **211/211** (23 arquivos) |
| Integração | `pnpm test:int` (precisa do Postgres) | **83/83** (10 arquivos) |
| E2E | `pnpm test:e2e` | **27/27** em 1,4 min (todos os specs, incluindo `visual.spec.ts`) |

---

## 3. Ambiente desta máquina (importante para não perder tempo)

- **Node** 22.23 · **pnpm** 12.14 · **Docker** 29 / Compose v5 · **gh** logado como `guiwustro`.
- **Porta 3000 ocupada** por outro projeto (`crm-whatsapp-integration-app-1`). Use `PORT=3005 pnpm dev` (o script `dev` lê `PORT`). E2E usa 3100 (web) e 4101 (tickets); dev usa 4001 (tickets).
- **Postgres do projeto:** `docker compose up -d db` → `postgres:16-alpine` na **5432**, usuário/senha `nexo/nexo`, bancos `nexo`, `nexo_test`, `nexo_e2e` (criados por `db/init/01-databases.sql`). Estava rodando ao fim da sessão.
- **`.env`** já existe (cópia do `.env.example`, `LLM_PROVIDER=scripted`, sem chave da DeepSeek).
- **pnpm 12** bloqueia scripts de build: `pnpm-workspace.yaml` tem `allowBuilds: { esbuild: true }` e uma lista `minimumReleaseAgeExclude` para o Next 16.4.5. Se um `pnpm add` falhar com `ERR_PNPM_IGNORED_BUILDS`, rode `pnpm approve-builds <pacote>`.
- **Playwright** 1.64 com Chromium já instalado (`~/.cache/ms-playwright/chromium-1248`).
- PDF do PRD: não há `pdftotext`; o texto extraído (via pdfjs) ficou no scratchpad da sessão antiga. Anexo A e B já estão refletidos no código/seed — não precisa reler.

### Versões efetivamente instaladas (diferem do que o plano supunha)

| Pacote | Versão | Observação |
|---|---|---|
| next | 16.4.5 | `middleware.ts` virou **`proxy.ts`** no Next 16 |
| react | 19.3.1 | |
| typescript | **6.0.3** | não a 7.x: `typescript-eslint` exige `<6.1` |
| eslint | **9.x** | não a 10: `eslint-plugin-react` não suporta 10 |
| ai | 7.0.161 | stop condition chama **`isStepCount`** (não `stepCountIs`); modelo é **LanguageModelV4**; mock em `ai/test` (`MockLanguageModelV4`) |
| @ai-sdk/react | 4.0.x | `useChat` + `DefaultChatTransport` |
| @ai-sdk/deepseek | 3.0.x | |
| @mastra/core | 1.81.0 | `createTool({ execute: (input, context) })`, `context.requestContext`; `agent.stream(text, { memory: { thread, resource }, requestContext, maxSteps })`; chunks `text-delta` têm `payload.text`; `await stream.usage` |
| @mastra/memory / @mastra/pg | 1.40 / 1.34 | `new Memory({ storage: new PostgresStore({ connectionString, schemaName: 'mastra' }) })`; leitura `memory.recall({ threadId })`; escrita `memory.saveMessages(...)` |
| drizzle-orm / drizzle-kit | 0.45 / 0.31 | erros do Postgres vêm embrulhados: o código SQL fica em `err.cause.code` |
| zod | 4.6 | |
| vitest | 5.1 | sem `environmentMatchGlobs`: arquivos `*.dom.test.tsx` usam o comentário `// @vitest-environment jsdom` |

---

## 4. Comandos

```bash
docker compose up -d db            # Postgres local
pnpm db:migrate && pnpm db:seed    # banco "nexo" (dev)
PORT=3005 pnpm dev                 # web :3005 + chamados :4001 (concurrently)
bash scripts/dev.sh                # tudo acima de uma vez (usa a porta 3000 por padrão)

pnpm check                         # typecheck + lint + unit
pnpm test                          # unit (Vitest, project "unit")
pnpm test:int                      # integração (project "integration", banco nexo_test)
pnpm test:e2e                      # Playwright: builda o Next em .next-e2e e sobe web:3100 + tickets:4101
pnpm db:generate                   # gera migration nova a partir de lib/db/schema/*
```

Notas:
- `pnpm test:int` força `DATABASE_URL = DATABASE_URL_TEST` e `LLM_PROVIDER=scripted` (`tests/setup-integration.ts`).
- E2E: `playwright.config.ts` usa `reuseExistingServer` fora do CI. Se mudar código do servidor e um servidor velho estiver de pé em 3100/4101, ele será reaproveitado — mate-o antes (`ss -ltnp | grep -E ':(3100|4101)'`).
- `e2e/env.ts` concentra o ambiente do E2E (`E2E=true`, `NOW_OVERRIDE` = terça 03/11/2026 10:00 SP, segredos de teste, `NEXT_DIST_DIR=.next-e2e`).
- Capturas para comparar com o protótipo: `pnpm test:e2e e2e/visual.spec.ts` → `test-results/telas/*.png` (login, perfil, chat-novo-chamado, chat-consulta, painel-decisao, console-transferida, console-assumida). Todas foram conferidas visualmente contra os frames do `.pen` nesta sessão.

---

## 5. O que foi construído (mapa por área)

### Regras puras — `lib/regras/` (o código decide, o modelo só interpreta)
- `horario-util.ts` — `addBusinessHours`, `addBusinessDays` (seg–sex 8h–18h, `America/Sao_Paulo` via `TZDate`, independente do TZ do servidor).
- `prazo.ts` — `calcularPrazo` (Crítica 1 h corrida; Alta 4 h úteis; Média 3 dias úteis; Baixa 5 dias úteis), `formatarPrazoCurto` ("resposta até 13:43" / "resposta até qua 10:00"), `horaSp`, `mesmoDiaSp`.
- `prioridade.ts` — `calcularPrioridade` (impacto × urgência, com a frase da regra).
- `vencido.ts` — `estaVencido`, `descreverAtraso` ("há 6 dias · prazo vencido").
- `reabertura.ts` — `podeReabrir` (≤ 7×24 h).
- `conversa-estado.ts` — máquina `ai_handling | pending | claimed | closed` × eventos.

### Contratos — `lib/contracts/`
`enums.ts` (rótulos PT-BR, tons), `tickets.ts`, `drafts.ts` (+ `DraftEditSchema`), `decision.ts` (`TurnDecision`, `ActionTrace`, `ACTION_LABEL`), `parts.ts` (cards do chat), `api.ts`, `ui.ts` (partes `data-action|card|run|system` do stream).

### Banco — `lib/db/`, `db/migrations/0000_init.sql`
- Schema `public`: users, conversations (1 por funcionário, `session_id`/`session_message_count`), messages (`parts` jsonb, `metadata.handoff_id`), ai_agent_runs (`tool_calls`, `decision`, `cost_cents` nulo = não medido), llm_calls, ticket_drafts, handoffs (`employee_words`, `agent_reading`, `confidence`, `due_at`), knowledge_articles, event_log, api_audit_log, idempotency_keys. Schema `tickets`: tickets, ticket_events, idempotency_keys + sequências `inc_seq`/`req_seq`. Status sempre `text + CHECK`.
- `seed-data.ts` — 9 usuários com UUIDs fixos (`00000000-0000-4000-8000-00000000000N`, N=1 Ana … 9 Juliana), 9 chamados, 8 artigos (2 com o texto do Anexo B). `seed.ts` — `resetAndSeed(url, agora)` trunca tudo (inclusive o schema `mastra`) e recria relativo a `agora`; 6 conversas (Carla e Bruno `pending` com handoff; Diego e Elisa `ai_handling`; Fábio e Gabriela `closed`). `migrate.ts`, `reset.ts`, `client.ts` (`getDb()` singleton, `createDb(url)`).
- Memória do Mastra cria as próprias tabelas no schema `mastra` no primeiro uso.

### Serviço de chamados (legado simulado) — `services/tickets/src/`
Hono, processo próprio (`pnpm tickets:dev`/`tickets:start`, `Dockerfile.tickets`). `x-internal-secret` em tudo menos `/healthz`. Rotas: listar, ver (404 idêntico para alheio/inexistente), criar/atualizar/reabrir com `Idempotency-Key` (recibo gravado na mesma transação; mesma chave em paralelo = 1 chamado), transferir, `POST /_chaos/outage?seconds=N` (0 encerra a queda; só com `TICKETS_CHAOS_ENABLED=true`). Caos: taxa aleatória + quedas programadas com `Retry-After`.

### Borda do agent — `lib/agent-engine/edge/`
- `tickets/client.ts` — retry 2× (200/600 ms, respeita `Retry-After` até 1 s), timeout 2,5 s, disjuntor (3 falhas → 15 s aberto → meio-aberto), erros tipados (`TicketsTransportError`, `TicketsNotFoundError`, `TicketsRejectedError`). `getTicketsClient({ onRetry })`, `setTicketsClient(fake)` (testes), `resetTicketsClient()` (E2E).
- `llm/provider.ts` — `getModel()` → DeepSeek ou roteirizado; `setModelForTests(hooks?, model?, scripts?)`.
- `llm/scripted-model.ts` + `llm/scripts.ts` — modelo determinístico que exercita o pipeline real; roteiros: `vpn-809`, `win10`, `win11`, `so-eu`, `status`, `ver-codigo`, `rh`, `duvida-horario`, `incerto` (confiança 0,41), `promessa`, `decisao-invalida`, `fallback`. `decisionPrompt()` põe a fala entre `<mensagem_do_funcionario>`.
- `llm/cost.ts` (`custoEmCentavos`, null se faltar preço), `llm/record.ts` (`recordLlmCall`).

### Núcleo do agent — `lib/agent-engine/`
- `gatilhos/transferencia.ts` — `pediuAnalista` (regex PT-BR), `avaliarGatilhos` (precedência: limite → pedido → crítico N2 → baixa confiança N1 → oferta de vencido), `NIVEL_POR_MOTIVO`.
- `guardrails/` — `prometeuAnalista`, `afirmouCriacao`, `ajustarConfianca` (dúvida sem fonte ≤ 0,5).
- `conhecimento/busca.ts` — busca por tokens (3×tags + 2×título + 1×corpo), corta resultados < 40% do melhor.
- `tools/` — `buscar_meus_chamados` (`show` controla se aparece o seletor/card), `ver_chamado` (marca o chamado em foco), `buscar_artigos`, `montar_rascunho` (prioridade e prazo calculados no servidor; update/reopen exigem `target_code` do próprio funcionário), `oferecer_opcoes`, `transferir_para_analista`. `runTool()` registra a trilha (spinner → ✓/⚠/“tentando de novo”); `toMastraTools()` lê o `ToolCtx` do `RequestContext` (chave `nexo.tool_ctx`). Nenhum schema de tool tem identidade (testado).
- `agent/` — `instructions.ts` (PT-BR, escopo e redirecionamentos), `nexo-agent.ts`, `memory.ts` (`getMemory`, `noteToMemory`, `closeMemory`), `decisao.ts` (`declararDecisao` com `Output.object`, null se falhar), `rotulos.ts`, **`run-turn.ts`** (ordem: registra mensagem → portão de pausa → limite → pedido explícito sem modelo → stream com tools → persiste → decisão → ajustes → relê status (analista pode ter assumido no meio) → gatilhos/guardrails → grava run com custo somado).

### Domínio e API
- `lib/conversations/` — `service.ts` (`getOrCreateCurrent`, `appendMessage`, `registerEmployeeMessage`, `applyTransition` com trava otimista e 409 nomeando quem assumiu), `handoff.ts` (`createHandoff` + briefing), `queries.ts` (`listForAnalyst` com tags, `countsForAnalyst`, `listMessages` com ações do run), `serialize.ts`, `release-note.ts`, `transition-route.ts`.
- `lib/drafts/service.ts` — `createDraft`, `editDraft` (recalcula), `cancelDraft`, `confirmDraft` (idempotente; 503 mantém pendente; 422 → failed; sincroniza o card na mensagem; nota na memória).
- `lib/api/` (`ok`/`fail`/`withRoute`, `AppError` e filhos), `lib/auth/` (cookie `nexo_session` JWT HS256 12 h), `lib/event-log/`, `lib/audit/`, `lib/users/queries.ts`, `lib/server/session.ts` (páginas), `lib/env.ts` (Zod, lazy; `serverNow()` respeita `NOW_OVERRIDE` só com `E2E=true`).
- Rotas `app/api/v1/`: `ping`, `auth/login`, `auth/logout`, `me`, `conversations` (fila), `conversations/counts`, `conversations/current`, `conversations/[id]` (detalhe p/ console), `conversations/[id]/{messages,claim,release,close,handoffs}`, `drafts/[id]` (PATCH), `drafts/[id]/{confirm,cancel}`, `ai/runs/[id]`, `employees/[id]/tickets`, `events` (SSE do `event_log`, filtro por papel, `Last-Event-ID`), `_test/reset` (só E2E).
- `proxy.ts` — redireciona por sessão/papel.

### UI
- Tokens do `.pen` em `app/globals.css` (`@theme`), fontes Schibsted Grotesk + Newsreader.
- Login (`app/(auth)/login`, `components/auth/LoginForm.tsx`), shell do funcionário (`components/shell/*`), Meu perfil.
- Chat (`components/chat/`): `ChatView` (histórico do servidor + stream do `useChat`; recarrega no fim do turno e em eventos SSE), `AgentMessage`, `StatusLine`, `TicketCard`, `TicketSelector`, `DraftCard` (editar/confirmar/cancelar, ⌘↵/Ctrl+Enter, estados confirmado/cancelado/falhou/erro 503), `QuickReplies` (teclas 1–4), `Composer` (contador N/30), `SystemEvent`, `DecisionPanel` + `ConfidenceBar` (painel "Por que o Nexo fez isso?").
- Console (`components/console/`): `ConsoleFrame` (rail + lista), `ConversationList`, `ConversationFilters`, `ConsoleConversation` (header, thread, takeover, painel, toast), `ConsoleThread`, `HandoffCard`, `TakeoverBar`, `EmployeeTickets`, `avatar.tsx`. `lib/client/use-events.ts` (SSE → polling 3 s). `components/ui/*` (Button, Tag/Dot, Kbd, Spinner, Banner, Toast, NexoMark).

---

## 6. Task a task (o que foi feito e como foi testado)

| Task | Entrega | Testes |
|---|---|---|
| 0 | Scaffold Next 16 manual (diretório não vazio), configs, compose, `lib/env.ts`, `/ping` | `tests/unit/env.test.ts` |
| 1 | Contratos Zod | `tests/unit/contracts.test.ts` |
| 2 | Horário útil e prazos | `tests/unit/regras/prazo.test.ts` (tabela × TZ UTC/Tóquio/SP) |
| 3 | Prioridade | `tests/unit/regras/prioridade.test.ts` |
| 4 | Vencido e reabertura | `tests/unit/regras/{vencido,reabertura}.test.ts` |
| 5 | Máquina de estados | `tests/unit/regras/conversa-estado.test.ts` (matriz 20 casos) |
| 6 | Gatilhos e guardrails | `tests/unit/agent/{gatilhos,guardrails}.test.ts` |
| 7 | Busca na central | `tests/unit/agent/busca.test.ts` |
| 8 | Schema, migration, seed | `tests/integration/db/seed.test.ts` |
| 9 | Serviço de chamados | `tests/integration/tickets/service.test.ts`, `tests/unit/tickets/chaos.test.ts` |
| 10 | Cliente com retry/disjuntor | `tests/unit/edge/{tickets-client,breaker}.test.ts` |
| 11 | Envelope, sessão, login, proxy | `tests/unit/{api/wrappers,auth/session}.test.ts`, `tests/integration/api/auth.test.ts` |
| 12 | Login, shell, perfil, base E2E | `e2e/auth.spec.ts` (7), captura login/perfil |
| 13 | Domínio de conversas | `tests/integration/conversations/service.test.ts` (inclui `Promise.all` de dois claims) |
| 14 | Borda LLM + roteirizado | `tests/unit/edge/{cost,scripted-model}.test.ts` |
| 15 | Tools | `tests/unit/agent/{tools,rotulos}.test.ts`, `tests/integration/agent/montar-rascunho.test.ts` |
| 16 | `runTurn` | `tests/integration/agent/run-turn.test.ts` (10 casos, inclui analista assumindo no meio do stream) |
| 17 | Rotas do chat, rascunhos, trilha | `tests/integration/api/{chat,drafts}.test.ts` (duas confirmações concorrentes, 31ª msg, 404 alheio) |
| 18 | Chat do funcionário | DOM: `QuickReplies`, `DraftCard`, `Composer`; E2E: `abrir-chamado`, `consultar-chamado`, `privacidade`, `fora-de-escopo` |
| 19 | Painel "Por quê?" | DOM `ConfidenceBar`; E2E `transparencia.spec.ts` |
| 20 | API do console + SSE | `tests/integration/api/{console,events}.test.ts` |
| 21 | Console (Telas 4 e 5) | DOM `use-events`; E2E `transferencia.spec.ts` (fluxo completo com 2 navegadores, corrida de 2 analistas, painel/filtros/busca) |
| 22 | E2E de resiliência | `instabilidade.spec.ts`, `limite-sessao.spec.ts`, `continuidade.spec.ts`; suíte E2E completa 27/27 |

Bugs reais encontrados e corrigidos com teste antes (RED→GREEN): valores vazios no `.env` quebravam o parse (Task 8); busca puxava artigo sem relação pela palavra "erro" (Task 19); 409 de assumir não dizia quem assumiu (Task 21).

---

## 7. Decisões tomadas (rulings) — lista completa

Cada linha: o que foi decidido — por quê — custo se estiver errado.

- **T0** TypeScript 6.0.3 e ESLint 9 (não 7.x/10) — compatibilidade de peers — custo: subir versão depois.
- **T0** Testes DOM com comentário `@vitest-environment jsdom` no projeto `unit` — Vitest 5 não tem `environmentMatchGlobs` — custo: ajuste de config.
- **T0** Porta do dev configurável por `PORT` (3000 ocupada aqui) — custo: nenhum.
- **T0** Repo iniciado direto na `main`, como o plano manda — custo: renomear branch.
- **T1** Campo do tipo de rascunho no card é `draft_kind` (o plano dizia `kind`, que colide com o discriminador) + `target_code`, `result_ticket_code` — custo: renomear.
- **T1** Enums de intenção/ação em inglês snake_case — custo: renomear.
- **T1** `ActionTrace.result` aceita `running` — custo: nenhum.
- **T2** Linha da tabela do plano "sáb 22:00 crítica → dom 23:00" estava errada; 1 h corrida dá sáb 23:00 — custo: nenhum.
- **T8** Reset põe `inc_seq` em 20520 (seed tem INC-20519) — custo: nenhum.
- **T8** UUIDs fixos no seed — custo: nenhum.
- **T8** Colunas extras: handoffs `employee_words`, `agent_reading`, `confidence`, origens `guardrail`/`budget`; ai_agent_runs `model` — custo: só schema.
- **T8** Preview da conversa guarda o prefixo "Nexo: " para mensagens do agent — custo: lógica de prefixo na UI.
- **T8** Caso semeado do Bruno é aviso no sistema de estoque — custo: nenhum.
- **T9** `TransferInput` ganhou `requester_id` (privacidade também na transferência); deps `chaosEnabled` — custo: nenhum.
- **T9** `/healthz` e `/_chaos` fora do middleware de caos — custo: nenhum.
- **T9** Serviço usa `NOW_OVERRIDE` para regras, relógio real para o caos — custo: nenhum.
- **T10** Disjuntor conta 1 falha por chamada (após retries); 4xx conta como sucesso; cliente por turno compartilha o disjuntor — custo: ajuste fino.
- **T11** `proxy.ts` em vez de `middleware.ts` (Next 16) — custo: renomear.
- **T11** `withRoute` com papel `public` — custo: nenhum.
- **T12** E2E builda em `.next-e2e`; `output: 'standalone'` só com `NEXT_OUTPUT=standalone` — **custo: o Dockerfile da Task 25 precisa setar `NEXT_OUTPUT=standalone`**.
- **T12** `loginAs` faz login pela API — custo: nenhum.
- **T13** Contadores esperados "Para você: 3" (o plano dizia 1, contradizendo o próprio seed) — custo: nenhum.
- **T13** Tags extras `with_other` e `closed`; limite → "Transferida · limite da sessão" — custo: mapeamento na UI.
- **T13** Textos "‹nome› devolveu ao agent · hh:mm" e "Atendimento encerrado por ‹nome› · hh:mm" — custo: copy.
- **T14** `isStepCount` / LanguageModelV4 como instalados — custo: nenhum.
- **T14** Roteirizado acha o passo contando respostas do assistente; textos podem depender do resultado das tools — custo: nenhum.
- **T14** Fala do funcionário entre tags no prompt da decisão; roteiros extras `win10` e `decisao-invalida` — custo: nenhum.
- **T15** `buscar_meus_chamados` com `show` (default false) — custo: o modelo precisa passar `show=true` em perguntas de status (instruções e roteiros fazem).
- **T15** `ToolCtx` com `employee_text`, carregador de artigos, ouvinte de retry e sinais do turno — custo: nenhum.
- **T15** Contexto do turno via `RequestContext` (`nexo.tool_ctx`) — custo: nenhum.
- **T16** `run_id` null em `paused`; desfecho extra `failed` — custo: nenhum.
- **T16** Turnos sem modelo (pedido explícito, limite) também gravam run com decisão de regra e custo 0 — custo: nenhum.
- **T16** Fontes da decisão = fontes que as tools realmente retornaram — custo: fontes citadas pelo modelo são ignoradas.
- **T16** Enquanto a tool roda, só o primeiro rótulo aparece — custo: nenhum.
- **T17** Só a requisição que vira o rascunho de `pending` para `confirmed` grava mensagem/eventos — custo: nenhum.
- **T17** Card do rascunho na mensagem do agent sincronizado com a linha do rascunho — custo: um update a mais.
- **T17** Corpo do POST de mensagem é `{ text }` — custo: nenhum.
- **T18** Teclas 1–4 funcionam fora de campos de texto ou no composer vazio — custo: digitar um número no composer vazio escolhe a opção.
- **T18** Oferta do vencido como chips na bolha depois do card; "Adicionar informação" preenche o composer — custo: nenhum.
- **T18** Histórico traz as ações do run de cada mensagem — custo: um join.
- **T19** Busca corta resultados abaixo de 40% do melhor score (bug real) — custo: nenhum.
- **T19** Status line do histórico abre o painel mesmo com decisão nula — custo: nenhum.
- **T20** SSE sem `Last-Event-ID` começa do último evento; aceita `?last_event_id=` — custo: nenhum.
- **T20** `GET /employees/:id/tickets` devolve `{ tickets, open, closed }` — custo: nenhum.
- **T21** Rota nova `GET /conversations/:id` (não estava no plano) — custo: uma rota.
- **T21** `ver_chamado` define o chamado em foco; pedido explícito leva o foco para a passagem (código, prioridade, transferência no legado) — custo: uma chamada a mais ao legado nesse caminho.
- **T21** 409 de assumir nomeia quem assumiu (bug real) — custo: nenhum.
- **T21** E2E da corrida isola a página da Juliana (SSE abortado, GET servido antigo) — custo: nenhum.
- **T21** Em E2E o "agora" do servidor é fixo (10:00) e os timestamps do banco são reais: horários nas capturas podem divergir — só cosmético em E2E.
- **T22** Os 4 specs passaram de primeira (o comportamento já existia); a única mudança foi isolamento entre testes: `POST /api/v1/_test/reset` (só com `E2E=true`) e `/_chaos/outage?seconds=0`, chamados pela fixture `seed` antes de cada teste — custo: nenhum.
- **T22** O spec de queda monta o rascunho com "Só eu, preciso da VPN hoje" (o roteiro VPN para, com honestidade, quando o sistema está fora) — custo: nenhum.

---

## 8. O que falta (Tasks 23–27) e o que exige confirmação do Gui

Leia o brief de cada task com `task-start` (tem os valores exatos). Notas adicionais:

### Task 23 — Evals com modelo real (`evals/cenarios.ts`, `evals/run.ts`, `evals/README.md`)
- **Precisa de `DEEPSEEK_API_KEY` e gasta dinheiro → pedir a chave/autorização ao Gui antes de rodar `pnpm eval`.** O script `eval` já está no `package.json` (`tsx evals/run.ts`).
- Reaproveitar: `runTurn` (com `LLM_PROVIDER=deepseek`), `createFakeTickets` (`tests/helpers/fake-tickets.ts`), `resetAndSeed` em `nexo_test`, writer coletor igual ao de `tests/integration/agent/run-turn.test.ts`. Ao trocar o provider em runtime, chamar `resetEnvCache()` e `setModelForTests(undefined)` (o `getModel()` é cacheado em `globalThis`).
- Preço do DeepSeek por env: `LLM_PRICE_IN_CENTS_PER_MTOK` / `LLM_PRICE_OUT_CENTS_PER_MTOK` (sem eles, custo fica "não medido").
- Verificar se a chamada de decisão (`Output.object`) funciona com a DeepSeek (ela tem modo JSON; o prompt já descreve o formato). Se falhar, a decisão vem `null` — aparece nos evals.
- Ajustes de prompt vão em `lib/agent-engine/agent/instructions.ts` e nas `description` das tools; cada ajuste = commit próprio com antes/depois. Nunca ajustar o eval para passar.

### Task 24 — Rate limit, orçamento e cabeçalhos
- `lib/api/rate-limit.ts` (janela deslizante em memória). Para o E2E não quebrar, `e2e/env.ts` já define `RATE_LIMIT_PER_MINUTE=1000`; registrar o reset do limitador em `globalThis.__nexoResetHooks` (a rota `_test/reset` já chama esses hooks).
- Chat já trata erro com código `rate_limited` mostrando um banner (`ChatView`, `parseChatError`) — falta o servidor devolver 429 `{ error: { code: 'rate_limited', message: 'Muitas mensagens em pouco tempo, aguarde Ns' } }` + `Retry-After` **antes** de abrir o stream.
- Orçamento: somar `llm_calls.cost_cents` do dia; acima de `LLM_DAILY_BUDGET_CENTS` → `runTurn` não chama o modelo e transfere (origem `budget` já existe no CHECK de handoffs; `NexoDataParts.system.kind` já tem `'budget'`).
- Headers de segurança em `next.config.ts` (`headers()`).

### Task 25 — Docker, CI, smoke
- `Dockerfile` do web: multi-stage, **`ENV NEXT_OUTPUT=standalone`** no build (ver ruling T12), usuário não-root, migrations no start. `Dockerfile.tickets` já existe (roda com tsx) — revisar.
- `docker-compose.yml`: adicionar perfil `full` (web + tickets). `docker-compose.prod.yml` conforme o plano (rede externa `cliniai_internal`).
- `.github/workflows/ci.yml` (check, integration com service Postgres, e2e) e `images.yml` (GHCR).
- `scripts/smoke.sh` (o script `smoke` já está no `package.json`).
- **Criar o repositório público no GitHub e dar push é ação externa → confirmar com o Gui antes.** Antes do push, decidir se `referencias/` (PRD e `.pen` do desafio) deve ir para um repo público.

### Task 26 — Deploy na VPS
- **Todo passo é externo e compartilhado com o primare-hub (Supabase, Registro.br, VPS, Caddy) → confirmar com o Gui antes de cada um**, como o próprio plano diz.

### Task 27 — README e revisão final
- Seções da ANALISE §11 + tabela de testes + divergências do protótipo (já listadas no plano e nos rulings acima) + capturas de `test-results/telas/`.
- Depois: **revisão final do branch inteiro** (skill executing-plans, seção "Final Review"): gerar o pacote com `review-package <plano> 0d99cbd HEAD` (0d99cbd = primeiro commit, só docs) e despachar um revisor (superpowers:requesting-code-review, modelo mais capaz). Corrigir Critical/Important com teste RED→GREEN; Minor vai para o ledger como `Final: minor (deferred)`. Por fim listar todos os rulings e minors na mensagem final e apagar `.superpowers/sdd/2026-11-03-nexo-assist/`.

---

## 9. Pegadinhas que custaram tempo nesta sessão

- **Lint `react-hooks/set-state-in-effect`** reclama de chamar função que faz `setState` dentro de `useEffect`, mesmo assíncrona. Padrões usados: buscar com `.then(setX)` direto no effect; "estado derivado" no render (`Composer` com `prefill`); ou `eslint-disable-next-line` com justificativa (`ConsoleConversation`).
- **`react-hooks/rules-of-hooks`** é desligado para `tests/**`, `e2e/**`, `evals/**` (por causa de `useTestDb`).
- **Typecheck mascarado:** `pnpm -s typecheck 2>&1 | grep error` engole o código de saída — um erro de tipo passou assim na Task 20 (corrigido em `d0f913f`). Rode `pnpm -s typecheck && …` sem pipe antes de commitar.
- **`sleep` em foreground é bloqueado** pelo harness; e **`pkill -f "<texto>"` pode matar o próprio shell** (o texto aparece na linha de comando) — use `ss -ltnp` + `kill <pid>`.
- **Drizzle**: violação de CHECK aparece como "Failed query…"; o código fica em `err.cause.code` (`23514`).
- **Next 16**: `next lint` não existe mais (usa-se `eslint .`); `params` das rotas é `Promise`.
- **`useChat`**: o transport manda só `{ text }` (`prepareSendMessagesRequest`); ao fim do stream o `ChatView` recarrega `/conversations/current` e limpa as mensagens ao vivo (servidor é a fonte da verdade).
- **E2E e estado em memória**: disjuntor do web e queda do serviço de chamados persistem entre testes — por isso a fixture `seed` chama os dois resets antes de cada teste.
- **Relógio do E2E**: navegador com `page.clock.setFixedTime(AGORA_E2E)` e servidor com `NOW_OVERRIDE`; o caos usa relógio real (quedas terminam de verdade).

---

## 10. Débitos menores conhecidos (não bloqueiam; avaliar na revisão final)

- `useEvents` cai para polling no primeiro `error` do `EventSource` e não tenta voltar ao SSE.
- Lista do console não tem paginação; busca usa `ILIKE` em nome, preview e chamado em foco.
- "digitando…" da lista do console não foi implementado (corte previsto no plano).
- O botão "Esqueci minha senha" e "Redefinir senha" são simulados (texto fixo), como o plano pede.
- Mensagens do analista criadas pelo POST devolvem `sender_level: null` na resposta imediata (a UI recarrega o histórico, que traz o nível certo).
