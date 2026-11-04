# Atendimentos separados — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar "uma conversa por funcionário" por atendimentos com começo e fim, no máximo um com o agent por vez e quantos houver com analistas, visíveis um a um para o funcionário e para o analista e ligados aos chamados nos dois sentidos.

**Architecture:** O ciclo de vida (abrir, resolver, juntar ao devolver) fica num módulo novo, `lib/conversations/attendance.ts`, sobre o `applyTransition` que já existe. Nenhum atendimento fecha por tempo. O contador da sessão sai de `conversations` e vai para a tabela `employee_sessions`. O agent ganha uma tool (`mark_resolved`) e uma recusa determinística (`ticket_with_analyst`). A UI troca "a conversa atual" por "um atendimento por id", com um seletor.

**Tech Stack:** Next.js 16 (App Router), Drizzle + Postgres, Mastra Memory (`@mastra/pg`), AI SDK 7, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-04-atendimentos.md`

## Global Constraints

- Código em inglês (nomes, arquivos, logs). Textos de tela, mensagens de sistema e prompt em português (`docs/MAPEAMENTO-INGLES.md` §1). A tool nova segue as outras: nome em inglês e `snake_case` (`mark_resolved`).
- Banco: Drizzle schema em `lib/db/schema/app.ts`, migration gerada com `pnpm db:generate` e editada à mão quando precisar mover dados. Nunca editar migrations anteriores.
- `closed` é terminal. Estados continuam `ai_handling | pending | claimed | closed`.
- `closed_reason` ∈ `analyst | resolved | merged`. Nenhum atendimento fecha por tempo (história 6 do PRD).
- Limite: `SESSION_MESSAGE_LIMIT` (30) por sessão de login, somando todos os atendimentos.
- Rótulos (exatos): `Encerrada`, `Resolvida pelo agent`, `Encerrada · juntada`, `Este atendimento foi encerrado`, `Falar de outro assunto`, `Atendimentos`, `Atendimentos sobre este chamado`, `Desta conversa`, `Ver na conversa`, `Aberto fora do Nexo Assist`, e as relações `Criado aqui`, `Atualizado aqui`, `Reaberto aqui`, `Em foco`.
- Mensagens de sistema (exatas, `timeInSaoPaulo(now)` no lugar de `{hora}`):
  - resolvido: `Atendimento resolvido · {hora}`
  - juntado (no devolvido): `{analista} devolveu ao agent · juntado ao atendimento atual · {hora}`
  - juntado (no ativo): `{analista} devolveu um atendimento sobre {código ou "outro assunto"} · o Nexo já sabe o que foi feito · {hora}`
- Cada tarefa termina com `pnpm check` verde; tarefas que mexem no banco também com `pnpm test:int`; as de UI também com o E2E da tarefa.

## Review Focus

1. **Corrida ao abrir um atendimento com o agent** (duas abas mandam a primeira mensagem ao mesmo tempo): os dois pedidos têm de cair no **mesmo** atendimento, sem erro 500. Teste na Task 3 (`getOrCreateWithAgent` concorrente).
2. **"Ver na conversa" para um card antigo** (mais de 50 mensagens atrás, fora da primeira página): a tela carrega páginas anteriores até achar a mensagem e destaca. Se ela não existir mais, abre o atendimento normalmente, sem erro e sem laço infinito. Teste na Task 8 (`useJumpToMessage`).
3. **Devolver quando o funcionário já tem outro atendimento com o agent:** sem violar o índice único e sem perder a nota do analista. Teste na Task 4.
4. **Mensagem num atendimento encerrado, pela aba antiga:** o turno roda num atendimento novo, e o cliente descobre pelo header `x-conversation-id`. Teste na Task 6.
5. **Funcionário abrindo `/atendimento/[id]` de outra pessoa:** 404, como hoje. Teste na Task 6.

---

### Task 1: Regras de estado — `closed` terminal, `resolve` e `merge`

**Files:**
- Modify: `lib/rules/conversation-state.ts`
- Test: `tests/unit/rules/conversation-state.test.ts` (já existe; ajustar)

**Interfaces:**
- Produces: `ConversationEvent = 'transfer' | 'claim' | 'release' | 'close' | 'resolve' | 'merge' | 'employee_message'`. Transições novas: `ai_handling --resolve--> closed`, `pending|claimed --merge--> closed`. `closed` não aceita nenhum evento.

- [ ] **Step 1: Ajustar os testes**

```ts
it('closed é terminal', () => {
  for (const e of ['employee_message', 'release', 'claim', 'resolve'] as const)
    expect(transition('closed', e)).toEqual({ ok: false, code: 'invalid_transition' });
});
it('agent resolve só com o agent', () => {
  expect(transition('ai_handling', 'resolve')).toEqual({ ok: true, next: 'closed' });
  expect(transition('pending', 'resolve').ok).toBe(false);
});
it('merge fecha o que estava com analista', () => {
  expect(transition('pending', 'merge')).toEqual({ ok: true, next: 'closed' });
  expect(transition('claimed', 'merge')).toEqual({ ok: true, next: 'closed' });
  expect(transition('ai_handling', 'merge').ok).toBe(false);
});
```

Remover o caso atual que espera `closed + employee_message → ai_handling`.

- [ ] **Step 2: `pnpm test -- conversation-state`.** Esperado: FAIL nos três casos.
- [ ] **Step 3: Atualizar a tabela `TRANSITIONS`.**
- [ ] **Step 4: `pnpm test -- conversation-state`.** Esperado: PASS. `pnpm typecheck` aponta os `Record<ConversationEvent, …>` que precisam das chaves novas (`TEXT_BY_TRANSITION` e `EVENT_BY_TRANSITION` em `lib/conversations/service.ts` são `Partial`, então nada quebra lá).
- [ ] **Step 5: Commit** `feat(rules): atendimento encerrado é terminal; eventos resolve e merge`

---

### Task 2: Banco — vários atendimentos, motivo de encerramento e sessão por funcionário

**Files:**
- Modify: `lib/db/schema/app.ts`
- Create: `db/migrations/0006_attendances.sql` (gerada e depois editada) + snapshot/journal
- Modify: `lib/conversations/serialize.ts` (sai `session_message_count`)
- Test: `tests/integration/db/attendances-schema.test.ts`

**Interfaces:**
- Produces:
  - `conversations`: sem `session_id`, `session_message_count` e `session_started_at`; com `closed_at tstz null` e `closed_reason text null` (CHECK nos 3 valores, e `status <> 'closed' or closed_reason is not null`).
  - Índice `conversations_one_with_agent` = `uniqueIndex(...).on(t.employee_id).where(sql\`status = 'ai_handling'\`)`; continua o `conversations_status_idx`; novo `conversations_employee_idx` em `(employee_id, last_message_at)`.
  - Tabela `employeeSessions` (`employee_sessions`): `employee_id uuid pk → users.id`, `session_id text not null`, `session_started_at tstz not null`, `message_count integer not null default 0`, `updated_at tstz not null default now()`.
  - Tipo exportado `EmployeeSession = typeof employeeSessions.$inferSelect`.

- [ ] **Step 1: Teste de schema**

```ts
it('um funcionário não tem dois atendimentos com o agent', async () => {
  const ana = t.seed.users.ana.id;
  await t.db.insert(conversations).values({ employee_id: ana, status: 'ai_handling' });
  await expect(t.db.insert(conversations).values({ employee_id: ana, status: 'ai_handling' })).rejects.toThrow(/conversations_one_with_agent/);
});
it('vários com analista convivem com um com o agent', async () => { /* 1 ai_handling + 2 pending para a ana → ok */ });
it('closed exige motivo', async () => {
  await expect(t.db.insert(conversations).values({ employee_id: t.seed.users.ana.id, status: 'closed' })).rejects.toThrow();
});
```

- [ ] **Step 2: `pnpm test:int -- attendances-schema`.** Esperado: FAIL (segundo insert passa, porque hoje o índice é por funcionário e não por status; e não existe `closed_reason`).
- [ ] **Step 3: Schema e migration.** `pnpm db:generate`, e acrescentar à mão no SQL, nesta ordem, antes dos `DROP COLUMN`:
  1. `INSERT INTO employee_sessions (employee_id, session_id, session_started_at, message_count) SELECT employee_id, session_id, coalesce(session_started_at, now()), session_message_count FROM conversations WHERE session_id IS NOT NULL ON CONFLICT DO NOTHING;`
  2. `UPDATE conversations SET closed_reason = CASE WHEN EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.metadata->>'event' = 'claim') THEN 'analyst' ELSE 'resolved' END, closed_at = status_changed_at WHERE status = 'closed';`
  3. Os CHECKs novos só depois do UPDATE.
- [ ] **Step 4: Manter o resto funcionando com o CHECK novo:**
  - `applyTransition('close')` grava `closed_at` e `closed_reason: 'analyst'`;
  - o seed (`lib/db/seed.ts`): `ConvSeed` ganha `closed_reason`, e Fábio e Gabriela ficam com `'resolved'`;
  - quem lia `session_*` da conversa: `toApiConversation` perde o campo, e as leituras em `service.ts`, `current/route.ts` e `messages/route.ts` ficam com `// TODO(Task 3)` lendo `0`. Não pode sobrar TODO depois da Task 3.
- [ ] **Step 5: `pnpm db:migrate && pnpm test:int -- attendances-schema`.** Esperado: PASS. `pnpm typecheck` limpo.
- [ ] **Step 6: Commit** `feat(db): vários atendimentos por funcionário, motivo de encerramento e sessão por funcionário`

---

### Task 3: Ciclo de vida do atendimento — sessão, atual, abrir, resolver

**Files:**
- Create: `lib/conversations/attendance.ts`
- Modify: `lib/conversations/service.ts` (remove `getOrCreateCurrent`; `registerEmployeeMessage` conta em `employee_sessions`)
- Reaproveita: `noteToMemory` de `lib/agent-engine/agent/memory.ts` (sem mudar a assinatura)
- Test: `tests/integration/conversations/attendance.test.ts`; ajustar `tests/integration/conversations/service.test.ts`

**Interfaces:**
- Consumes: schema da Task 2; `transition` da Task 1; `appendMessage`, `applyTransition`, `getConversation` de `service.ts`; `noteToMemory(conversationId, employeeId, text)`.
- Produces (em `lib/conversations/attendance.ts`):
  - `touchSession(employeeId: string, sid: string, loginAt: Date): Promise<EmployeeSession>`: mesma regra de hoje (login mais novo zera; aparelho com login mais antigo continua).
  - `getSession(employeeId: string): Promise<EmployeeSession | null>`
  - `getCurrentForEmployee(employeeId: string, now: Date): Promise<Conversation>`. Ordem de escolha: aberto mais recente por `coalesce(last_message_at, created_at)`; senão o encerrado mais recente; senão cria vazio com o agent.
  - `getOrCreateWithAgent(employeeId: string, now: Date): Promise<{ conversation: Conversation; created: boolean }>`: `insert … on conflict do nothing` com o alvo do índice parcial (`target: conversations.employee_id, where: sql\`status = 'ai_handling'\``) e depois `select`. Com `created`, grava `previousAttendanceNote` na memória do novo.
  - `previousAttendanceNote(employeeId: string, excludeId: string): Promise<string | null>`: até 3 encerrados mais recentes, uma linha cada: `Atendimento de {dd/MM} ({rótulo do motivo}): {last_message_preview}; chamados: {códigos ou "nenhum"}`. O cabeçalho é `Atendimentos anteriores deste funcionário:`.
  - `resolveConversation(conversationId: string, now: Date): Promise<Conversation | null>`: transição `resolve`, só se `ai_handling` e sem rascunho `pending` (o card não pode ficar num atendimento encerrado esperando confirmação). Grava `closed_at`, `closed_reason: 'resolved'`, a mensagem de sistema e o evento `conversation.closed` com `payload.reason`. Devolve `null` se não fechou.
  - `ticketCodesOf(conversationIds: string[]): Promise<Map<string, string[]>>`: `focus_ticket_code` + `ticket_drafts.result_ticket_code`/`target_ticket_code` de rascunhos `confirmed`, sem repetir, com o foco primeiro.
  - `closedLabel(reason: string | null): string`: `analyst → 'Encerrada'`, `resolved → 'Resolvida pelo agent'`, `merged → 'Encerrada · juntada'`.
- Produces (em `service.ts`): `registerEmployeeMessage(conversationId: string, body: string, limit: number)` com o mesmo retorno de hoje. O `count` vem de `employee_sessions` (lock `for update` na linha do funcionário).

- [ ] **Step 1: Testes** (`attendance.test.ts`, com o relógio do `useTestDb`):

```ts
it('getOrCreateWithAgent concorrente devolve o mesmo atendimento', async () => {
  const [a, b] = await Promise.all([getOrCreateWithAgent(ana, t.now), getOrCreateWithAgent(ana, t.now)]);
  expect(a.conversation.id).toBe(b.conversation.id);
  expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
});
it('getCurrentForEmployee prefere aberto, depois encerrado, depois cria', async () => { /* três cenários */ });
it('atendimento parado há dias continua sendo o atual', async () => { /* last_message_at = agora-10 dias, ai_handling → getCurrentForEmployee devolve ele, sem encerrar */ });
it('resolveConversation não fecha com rascunho pendente', async () => { /* rascunho pending → null, continua ai_handling */ });
it('novo atendimento recebe nota dos anteriores na memória', async () => { /* 1 encerrado com INC-20311 em foco → thread do novo tem 'Atendimentos anteriores deste funcionário:' e 'INC-20311' */ });
it('sessão soma mensagens de todos os atendimentos', async () => { /* 1 msg no pending + 1 no ai_handling → count 2 */ });
it('resolveConversation não fecha com analista', async () => { /* pending → null */ });
it('ticketCodesOf junta foco e rascunhos confirmados', async () => { /* foco INC-1, rascunho confirmed→INC-2, rascunho cancelled→INC-3 ⇒ ['INC-1','INC-2'] */ });
```

Em `service.test.ts`: trocar `getOrCreateCurrent` por `getOrCreateWithAgent`/`touchSession`, e o caso "mensagem em closed volta para ai_handling" passa a esperar `invalid_transition` (quem reencaminha é a rota, Task 6).

- [ ] **Step 2: `pnpm test:int -- conversations`.** Esperado: FAIL (o módulo não existe).
- [ ] **Step 3: Implementar `attendance.ts` e as mudanças em `service.ts`.**
- [ ] **Step 4: `pnpm test:int -- conversations`.** Esperado: PASS. `grep -rn "TODO(Task 3)"` vazio.
- [ ] **Step 5: Commit** `feat(conversas): ciclo de vida do atendimento e sessão por funcionário`

---

### Task 4: Devolver ao agent junta quando já há outro com o agent

**Files:**
- Modify: `lib/conversations/attendance.ts` (`releaseOrMerge`)
- Modify: `lib/conversations/service.ts` (`TEXT_BY_TRANSITION.merge`, `EVENT_BY_TRANSITION.merge = 'conversation.closed'`; `merge` grava `closed_reason: 'merged'`)
- Modify: `lib/conversations/release-note.ts` (`writeReleaseNote(sourceId, targetId, employeeId, analyst)`: lê as mensagens do analista em `sourceId` e grava em `targetId`)
- Modify: `lib/conversations/transition-route.ts` (`release` → `releaseOrMerge`)
- Modify: `lib/conversations/queries.ts` (`QueueItem.employee_has_agent_attendance: boolean`)
- Test: `tests/integration/conversations/attendance.test.ts`, `tests/integration/api/console.test.ts`

**Interfaces:**
- Produces: `releaseOrMerge(conversationId: string, actor: Actor, now: Date): Promise<{ conversation: Conversation; merged_into: string | null }>`. A rota devolve `{ ...toApiConversation(conversation), merged_into }`.

- [ ] **Step 1: Testes**

```ts
it('devolver sem outro ativo volta para o agent', async () => { /* pending→claim→releaseOrMerge ⇒ ai_handling, merged_into null */ });
it('devolver com outro ativo junta', async () => {
  // ana: A claimed por rafael; B ai_handling
  const r = await releaseOrMerge(A, rafael(), t.now);
  expect(r.merged_into).toBe(B);
  expect((await getConversation(t.db, A))).toMatchObject({ status: 'closed', closed_reason: 'merged' });
  // B tem a mensagem de sistema 'Rafael Lima devolveu um atendimento sobre INC-20311 · o Nexo já sabe o que foi feito · …'
  // a thread de B na memória tem '[nota do sistema] O analista Rafael Lima atendeu e devolveu: …'
});
```

Em `console.test.ts`: `GET /conversations/:id` traz `employee_has_agent_attendance: true` para A no cenário acima.

- [ ] **Step 2: `pnpm test:int -- attendance console`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.** Tudo numa transação: travar o atendimento com o agent do funcionário (`for update`). Se ele existir, `applyTransition(A, 'merge', …, { tx })` mais a mensagem no B; senão, `release`. A nota da memória vai depois do commit, com `.catch` e log, como hoje.
- [ ] **Step 4: `pnpm test:int -- attendance console`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat(console): devolver junta ao atendimento ativo com o agent`

---

### Task 5: Agent — `mark_resolved` e chamado que já está com um analista

**Files:**
- Create: `lib/agent-engine/tools/mark-resolved.ts`
- Modify: `lib/agent-engine/tools/index.ts`, `lib/agent-engine/tools/types.ts` (`TurnSignals.resolved?: boolean`)
- Modify: `lib/agent-engine/tools/build-draft.ts`, `lib/agent-engine/tools/get-ticket.ts`
- Create: `lib/conversations/ticket-elsewhere.ts`
- Modify: `lib/agent-engine/agent/run-turn.ts` (pós-turno: `turn.resolved` → `resolveConversation(id, now)`)
- Modify: `lib/agent-engine/agent/instructions.ts`, `lib/agent-engine/agent/labels.ts` (rótulo da ação: `encerrou o atendimento`)
- Modify: `lib/agent-engine/edge/llm/scripts.ts` (roteiro `resolveu`: `/\b(isso )?resolveu\b|sim, resolveu/i` → `mark_resolved` → texto `Que bom! Vou encerrar este atendimento. Se precisar, é só escrever.`)
- Test: `tests/integration/agent/run-turn.test.ts`, `tests/integration/agent/build-draft.test.ts`, `tests/unit/agent/tools.test.ts` (ou o arquivo de unitários das tools que já existe)

**Interfaces:**
- Consumes: `resolveConversation` (Task 3).
- Produces:
  - Tool `mark_resolved`, input `z.object({ summary: z.string().min(3).max(300) })`. Ela só marca `ctx.turn.resolved = true` e emite a ação. Quem fecha é o pós-turno, depois de gravar a resposta, e só se a conversa ainda estiver `ai_handling` (transferência no mesmo turno vence).
  - `findAnalystAttendanceFor(employeeId: string, ticketCode: string, exceptId: string): Promise<{ conversation_id: string; status: 'pending' | 'claimed'; analyst_name: string | null } | null>`: atendimento aberto com analista cujo `focus_ticket_code` é o código.
  - `build_draft` com `kind` `update` ou `reopen` e `target_code` nessa situação devolve `{ ok: false, reason: 'ticket_with_analyst', analyst_name, conversation_id }` e não grava rascunho.
  - `get_ticket` acrescenta `with_analyst: { analyst_name: string | null; conversation_id: string } | null` ao resultado.
- Instruções (acrescentar, em português): oferecer `Sim, resolveu` / `Não, ainda preciso de ajuda` depois de uma resposta que deve resolver; chamar `mark_resolved` quando o funcionário disser que resolveu; com `ticket_with_analyst`, dizer que o chamado já está com {analista} no outro atendimento e que ele pode continuar por lá.

- [ ] **Step 1: Testes**

```ts
it('“isso resolveu” encerra o atendimento depois da resposta', async () => {
  const r = await turno('Isso resolveu, obrigado!');
  expect(await conv()).toMatchObject({ status: 'closed', closed_reason: 'resolved' });
  // última mensagem de sistema: 'Atendimento resolvido · …'; a resposta do agent foi gravada antes dela
});
it('resolver não fecha se o turno transferiu', async () => { /* roteiro que chama transfer_to_analyst e mark_resolved ⇒ pending */ });
it('build_draft recusa atualizar chamado que está com analista em outro atendimento', async () => {
  // A pending com foco INC-20311; B ai_handling
  expect(await rodarTool(B, { kind: 'update', target_code: 'INC-20311', … })).toMatchObject({ ok: false, reason: 'ticket_with_analyst', analyst_name: null });
  // nenhum ticket_drafts novo
});
it('get_ticket informa o atendimento com analista', async () => { /* with_analyst.conversation_id === A */ });
```

- [ ] **Step 2: `pnpm test:int -- agent`.** Esperado: FAIL.
- [ ] **Step 3: Implementar a tool, o pós-turno, a recusa, o roteiro, as instruções e o rótulo.**
- [ ] **Step 4: `pnpm test:int -- agent && pnpm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat(agent): mark_resolved encerra o atendimento; chamado com analista em outro atendimento`

---

### Task 6: API do funcionário — atual, lista, um por id, abrir, mensagem reencaminhada

**Files:**
- Modify: `app/api/v1/conversations/current/route.ts`
- Modify: `app/api/v1/conversations/route.ts` (acrescentar `POST`, só funcionário)
- Create: `app/api/v1/me/conversations/route.ts`, `app/api/v1/me/conversations/[id]/route.ts`
- Modify: `app/api/v1/conversations/[id]/messages/route.ts`
- Modify: `lib/client/api.ts` (`CurrentData`, `AttendanceSummary`)
- Create: `lib/conversations/employee-view.ts` (monta `CurrentData` e `AttendanceSummary`)
- Test: `tests/integration/api/chat.test.ts`, `tests/integration/api/attendances.test.ts`

**Interfaces:**
- Consumes: Task 3 (`touchSession`, `getSession`, `getCurrentForEmployee`, `getOrCreateWithAgent`, `ticketCodesOf`, `closedLabel`).
- Produces:
  - `AttendanceSummary = { id; status; label: string; analyst_name: string | null; focus_ticket_code: string | null; ticket_codes: string[]; started_at: string; last_message_at: string | null; last_message_preview: string | null; closed_reason: 'analyst'|'resolved'|'merged'|null }`. `label`: `Com o Nexo` · `Aguardando analista` · `Com {analista}` · `closedLabel(...)`.
  - `CurrentData = { conversation: AttendanceSummary; messages; next_cursor; session: { count; limit }; others: AttendanceSummary[] }`. `others` = os outros abertos.
  - `GET /api/v1/conversations/current` → `CurrentData` (`touchSession` + `getCurrentForEmployee`).
  - `POST /api/v1/conversations` (employee) → `201 AttendanceSummary` (`getOrCreateWithAgent`; `200` se já existia).
  - `GET /api/v1/me/conversations` → `AttendanceSummary[]`: abertos primeiro, depois encerrados; os vazios ficam de fora.
  - `GET /api/v1/me/conversations/:id` → `CurrentData`; de outro funcionário → 404 `conversation_not_found`.
  - `POST /api/v1/conversations/:id/messages` (employee): a conversa tem de ser dele (senão 404). Se ela estiver `closed`, usa `getOrCreateWithAgent`. O limite vem de `getSession`. A resposta leva o header `x-conversation-id` com o id onde o turno rodou.

- [ ] **Step 1: Testes** (`attendances.test.ts`, com o helper de `tests/helpers/api.ts`):

```ts
it('mensagem em atendimento encerrado roda num novo e devolve o id no header', async () => {
  // ana: X closed ⇒ POST /conversations/X/messages
  expect(res.headers.get('x-conversation-id')).not.toBe(X);
  // X continua closed; o novo é ai_handling e tem a mensagem
});
it('POST /conversations com analista atendendo abre outro com o agent', async () => { /* A pending ⇒ 201, id ≠ A; segundo POST ⇒ 200, mesmo id */ });
it('GET /me/conversations ordena abertos antes de encerrados e esconde vazios', async () => {});
it('GET /me/conversations/:id de outro funcionário é 404', async () => {});
it('current mostra o transferido quando ele é o mais recente', async () => {});
it('limite da sessão soma atendimentos', async () => { /* 29 no A + a 30ª no B transfere B */ });
```

Ajustar `chat.test.ts` onde ele esperava `conversation.session_message_count` ou a mesma conversa depois de encerrada.

- [ ] **Step 2: `pnpm test:int -- api`.** Esperado: FAIL.
- [ ] **Step 3: Implementar as rotas e `employee-view.ts`.**
- [ ] **Step 4: `pnpm test:int`.** Esperado: tudo PASS.
- [ ] **Step 5: Commit** `feat(api): atendimentos do funcionário — atual, lista, por id e mensagem reencaminhada`

---

### Task 7: API do console e dos chamados — atendimento vazio some, chamados do atendimento, atendimentos do chamado

**Files:**
- Modify: `lib/conversations/queries.ts` (`listForAnalyst` e `countsForAnalyst` com `last_message_at is not null`; `QueueItem.ticket_codes: string[]`; `tagFor` usa `closedLabel`)
- Create: `lib/conversations/ticket-attendances.ts`
- Modify: `lib/tickets/views.ts` (`getTicketDetailOf` com `attendances`)
- Modify: `app/api/v1/me/tickets/[code]/route.ts` (o mesmo campo, para o funcionário)
- Modify: `lib/db/seed.ts` (o seed da Elisa ganha o rascunho `confirmed` com `result_ticket_code: 'INC-20519'` e a mensagem com o card dele (`parts: [{ kind: 'draft_card', draft_id, … }]`, no formato de `lib/contracts/parts.ts`), para "Criado aqui" e "Ver na conversa" existirem na demo e no E2E da Task 9)
- Test: `tests/integration/api/console.test.ts`, `tests/integration/api/my-tickets.test.ts`

**Interfaces:**
- Produces:
  - `TicketAttendance = { conversation_id: string; started_at: string; status: ConversationStatus; label: string; relation: 'created' | 'updated' | 'reopened' | 'focus'; message_id: string | null }`.
  - `attendancesForTicket(employeeId: string, code: string): Promise<TicketAttendance[]>`, do mais recente para o mais antigo. `relation` vem do rascunho confirmado (`create` → `created`, `update` → `updated`, `reopen` → `reopened`) ou do foco. `message_id` é a mensagem que tem o card do rascunho (`messages.parts @> jsonb_build_array(jsonb_build_object('draft_id', <id do rascunho>))`). Para `focus`, é `null`.
  - O detalhe do chamado (console e funcionário) ganha `attendances: TicketAttendance[]`. Lista vazia significa chamado aberto fora do chat.

- [ ] **Step 1: Testes.**
  - A fila não lista atendimento sem mensagem, e a contagem bate.
  - `ticket_codes` traz o foco e os confirmados.
  - O detalhe do INC-20519 (Elisa) mostra `relation: 'created'` com o `conversation_id` certo e o `message_id` da mensagem do card.
  - O INC-20298 (seed, sem conversa) volta com `attendances: []`.
  - O funcionário não vê atendimentos de outra pessoa (chamado de outro → 404, como hoje).
- [ ] **Step 2: `pnpm test:int -- console my-tickets`.** Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `pnpm test:int`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat(console): chamados do atendimento e atendimentos do chamado`

---

### Task 8: Telas do funcionário — seletor, `/atendimento/[id]`, encerrado, "Falar de outro assunto" e "Ver na conversa"

**Files:**
- Create: `app/(employee)/atendimento/[id]/page.tsx` (lê `?msg=<message_id>`)
- Modify: `app/(employee)/atendimento/page.tsx` (`?sobre=` → `redirect('/atendimento/'+id)` quando `findAnalystAttendanceFor` achar um)
- Create: `components/chat/AttendanceSwitcher.tsx`
- Create: `lib/client/use-jump-to-message.ts`
- Modify: `components/chat/ChatView.tsx`:
  - prop `conversationId?: string`: carrega `/me/conversations/:id` ou `/conversations/current`;
  - depois do stream, se o `x-conversation-id` vier diferente, `router.replace('/atendimento/'+novo)`;
  - encerrado → aviso, e o composer continua ativo;
  - banner de analista com o botão `Falar de outro assunto` → `POST /conversations` → `/atendimento/:id`;
  - prop `jumpTo?: string` → `useJumpToMessage`.
- Modify: `components/tickets/MyTicketDetail.tsx`:
  - seção `Atendimentos sobre este chamado`: rótulo, data, relação e o link `Ver na conversa` → `/atendimento/:id?msg=:message_id`, ou sem `?msg` quando `message_id` é `null`;
  - lista vazia → `Aberto fora do Nexo Assist`.
- Test: `e2e/atendimentos.spec.ts` (novo), `tests/unit/components/AttendanceSwitcher.test.tsx`, `tests/unit/client/use-jump-to-message.test.tsx`

**Interfaces:**
- Consumes: `CurrentData`/`AttendanceSummary` (Task 6), `TicketAttendance` (Task 7), `findAnalystAttendanceFor` (Task 5).
- `AttendanceSwitcher({ current: AttendanceSummary; onOpen?: () => void })` busca `/me/conversations` ao abrir. Cada item tem `data-testid="attendance-item"`, mostra o rótulo, a data (`shortDate`) e os chamados, e é um link para `/atendimento/:id`. O atual fica marcado com `aria-current`. O botão de abrir tem `data-testid="attendance-switcher"` e texto `Atendimentos`, com o número de abertos quando houver mais de um.
- `useJumpToMessage(targetId: string | null, opts: { has: (id: string) => boolean; loadOlder: () => Promise<boolean>; maxPages?: number }): { highlighted: string | null }`:
  - enquanto `has(targetId)` for falso, chama `loadOlder()`, que devolve `false` quando não há mais páginas, até `maxPages` (padrão 10);
  - quando achar, `scrollIntoView({ block: 'center' })` no elemento `[data-message-id="<id>"]` e devolve `highlighted` por 3 s;
  - se não achar, desiste em silêncio.
  - Os itens do histórico ganham `data-message-id`; o destacado, `data-testid="message-highlight"` (anel com `--color-primary`).
  - É usado também pelo console na Task 9.

- [ ] **Step 1: E2E (`e2e/atendimentos.spec.ts`)**

```ts
test('com a conversa transferida, a funcionária fala de outro assunto com o agent', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await send(page, 'quero falar com um analista');
  await expect(page.getByTestId('analyst-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Falar de outro assunto' }).click();
  await expect(page).toHaveURL(/\/atendimento\/[0-9a-f-]{36}$/);
  await send(page, 'qual o horário do service desk?');
  await expect(page.getByTestId('agent-message').last()).toContainText('8h às 18h');
  await page.getByTestId('attendance-switcher').click();
  await expect(page.getByTestId('attendance-item')).toContainText(['Com o Nexo', 'Aguardando analista']);
});
test('“isso resolveu” encerra e a próxima mensagem começa outro atendimento', async ({ page, loginAs }) => {
  await loginAs(page, 'diego');
  await send(page, 'qual o horário do service desk?');
  await send(page, 'Sim, resolveu');
  await expect(page.getByText('Este atendimento foi encerrado')).toBeVisible();
  const antes = page.url();
  await send(page, 'como redefinir a senha da rede?');
  await expect(page).not.toHaveURL(antes);
  await expect(page.getByTestId('user-message')).toHaveCount(1);
});
test('Ver na conversa abre o atendimento no card do rascunho', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await send(page, 'Meu notebook não conecta na VPN, erro 809');
  await send(page, 'Windows 11');
  await send(page, 'Só eu, tenho reunião às 14h');
  await page.getByTestId('draft-confirm').click();
  const code = (await page.getByTestId('draft-card').textContent())!.match(/INC-\d+/)![0];
  await page.goto(`/chamados/${code}`);
  await page.getByRole('link', { name: 'Ver na conversa' }).click();
  await expect(page.getByTestId('message-highlight')).toContainText(code);
});
test('chamado sem atendimento diz que foi aberto fora do chat', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await page.goto('/chamados/INC-20298');
  await expect(page.getByText('Aberto fora do Nexo Assist')).toBeVisible();
});
test('Falar sobre este chamado abre o atendimento com analista daquele chamado', async ({ page, loginAs }) => {
  // carla: o seed tem a conversa transferida com foco INC-20388
  await loginAs(page, 'carla');
  await page.goto('/chamados/INC-20388');
  await page.getByRole('link', { name: 'Falar sobre este chamado' }).click();
  await expect(page.getByTestId('analyst-banner')).toBeVisible();
});
```

Unitário de `useJumpToMessage`:
- acha na 3ª página (`loadOlder` chamado 2 vezes);
- desiste quando `loadOlder` devolve `false`;
- respeita `maxPages`;
- `targetId` `null` não chama nada.

- [ ] **Step 2: `pnpm test:e2e -- atendimentos && pnpm test -- use-jump-to-message`.** Esperado: FAIL.
- [ ] **Step 3: Implementar as telas e o hook.** O estilo segue os componentes vizinhos (`Banner`, os tokens de `globals.css`), com estados de carregamento e erro como os do `ChatView`.
- [ ] **Step 4: `pnpm test:e2e -- atendimentos continuity open-ticket handoff`.** Esperado: PASS. O `continuity.spec.ts` continua valendo: o mesmo atendimento depois do reload e do novo login, com o contador zerado no novo login.
- [ ] **Step 5: Commit** `feat(chat): atendimentos do funcionário — seletor, encerrado e falar de outro assunto`

---

### Task 9: Telas do console — "Desta conversa", atendimentos do chamado e aviso ao devolver

**Files:**
- Modify: `components/console/EmployeeTickets.tsx` (prop `conversationCodes: string[]` no lugar de `focusCode`. "Desta conversa" lista todos, com o foco primeiro. "Outros chamados" fica com o resto)
- Modify: `components/console/ConsoleConversation.tsx` (passa `item.ticket_codes`; recarrega o item em `conversation.closed`)
- Modify: `components/console/TicketDetail.tsx`:
  - seção `Atendimentos sobre este chamado`: data, rótulo e relação (`Criado aqui`, `Atualizado aqui`, `Reaberto aqui`, `Em foco`);
  - link `Ver na conversa` → `/console/:id?msg=:message_id`, e o atual marcado como `Esta conversa`;
  - lista vazia → `Aberto fora do Nexo Assist`.
- Modify: `app/console/[conversationId]/page.tsx` e `components/console/ConsoleThread.tsx` (`?msg=` → `useJumpToMessage` da Task 8; os itens ganham `data-message-id`)
- Modify: `components/console/TakeoverBar.tsx` (com `employee_has_agent_attendance`, `title`/legenda: `A Ana já tem outro atendimento com o agent: devolver junta os dois`)
- Test: `e2e/atendimentos.spec.ts` (mais dois testes)

- [ ] **Step 1: E2E**

```ts
test('analista vê o atendimento de origem a partir do chamado', async ({ page, loginAs }) => {
  // elisa: o seed cria INC-20519 pelo rascunho da conversa dela
  await loginAs(page, 'rafael');
  await page.goto('/console');
  await page.getByText('Elisa Prado').click();
  await expect(page.getByTestId('focus-ticket')).toContainText('INC-20519');
  // abrir o detalhe do INC-20519 → 'Atendimentos sobre este chamado' mostra 'Criado aqui' e 'Esta conversa'
  // 'Ver na conversa' → message-highlight contém o card do rascunho do INC-20519
});
test('devolver com outro atendimento ativo junta', async ({ browser }) => { /* ana transfere, abre outro assunto; rafael assume e devolve ⇒ o devolvido mostra 'Encerrada · juntada'; o ativo da ana tem a mensagem de sistema */ });
```

- [ ] **Step 2: `pnpm test:e2e -- atendimentos`.** Esperado: FAIL nos dois novos.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: `pnpm test:e2e -- atendimentos console-controls handoff`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat(console): chamados do atendimento, atendimentos do chamado e aviso ao devolver`

---

### Task 10: Seed, evals, suíte completa e README

**Files:**
- Modify: `lib/db/seed.ts`, `lib/db/seed-data.ts`:
  - a Ana ganha um atendimento encerrado há 3 dias (`resolved`, sobre o Outlook no celular, foco INC-19877);
  - histórico realista nos chamados do seed (`tickets.ticket_events`, `actor` = nome do analista), com estes eventos:

    | Chamado | Eventos (além do `created`) |
    |---|---|
    | INC-20298 | `comment` Juliana Costa: `Verificando a permissão com o dono da pasta Financeiro.` · `status_changed`: `Em andamento` |
    | INC-20311 | `comment` Rafael Lima: `Pedi o log de desempenho; aguardando retorno da funcionária.` |
    | REQ-10442 | `status_changed`: `Aprovado pelo gestor` · `comment` Juliana Costa: `Monitor separado no estoque; entrega na próxima remessa.` |
    | INC-20150 | `comment` Rafael Lima: `Senha desbloqueada no SAP.` · `status_changed`: `Resolvido` |

  - `SeedResult.conversations` continua `Partial<Record<UserKey, string>>`, apontando para o atendimento mais recente de cada um.
- Modify: `evals/cenarios.ts` (cenário `duvida-resolvida`: pergunta da central → "isso resolveu" ⇒ espera a tool `mark_resolved` e `closed_reason = 'resolved'`)
- Modify: `e2e/visual.spec.ts` (captura nova `chat-atendimentos.png`) e `docs/telas/`
- Modify: `README.md`:
  - §2 (pastas e `attendance.ts`);
  - §3 (a tool nova e a recusa `ticket_with_analyst`);
  - §7 (trade-off "atendimentos em paralelo, no máximo um com o agent" e a divergência do protótipo: o seletor de atendimentos não existe lá);
  - tabela de testes com os números novos.
- Test: suíte inteira

- [x] **Step 1: Seed e `tests/integration/db/seed.test.ts`.** Novos asserts: a Ana tem 1 encerrado `resolved`, e o INC-20298 tem 3 eventos. `pnpm test:int -- seed`, que deve passar.
- [x] **Step 2: Suíte inteira:** `pnpm check && pnpm test:int && pnpm test:e2e`. Tudo verde: 279 unitários, 172 integração e 54 E2E.
- [x] **Step 3: Evals:** 15 cenários × 3; `duvida-resolvida` 3/3 e nenhum cenário antigo regredido. `evals/resultados.md` atualizado.
- [x] **Step 4: README e capturas.**
- [ ] **Step 5: Commit** `docs: atendimentos separados no README, seed e evals`
