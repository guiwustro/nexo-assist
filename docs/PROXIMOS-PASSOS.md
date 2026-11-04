# Próximos passos — o que corrigir

Levantado em 04/11/2026, rodando o app e olhando as telas. A ordem é a sugestão de prioridade.

Para subir o app: `PORT=3005 pnpm dev`. A porta 3000 é ocupada por outro projeto, e o banco sobe com `docker compose up -d db`.
Para voltar os dados ao estado inicial: `pnpm db:seed`.

---

## 1. Analista não consegue sair nem ver o perfil (alta) — ✅ feito em 04/11

> O avatar abre um menu (nome, e-mail, nível, Meu perfil, Sair). O perfil virou `ProfileDetails`, usado em `/perfil` e
> em `/console/perfil` (este com o nível). O ícone de conversas do rail é um link. E2E em `e2e/auth.spec.ts`.

**O que acontece:** no console, o avatar com as iniciais ("RL"), no canto inferior esquerdo, é só um `span`.
Não abre menu, não leva a um perfil e não tem "Sair". O analista fica preso logado.

**Onde:**
- `components/console/ConsoleFrame.tsx:67`: o avatar do rail.
- O logout do funcionário já existe e pode ser reaproveitado: `components/shell/Sidebar.tsx:17-21` (`sair()` faz
  `POST /api/v1/auth/logout`, depois `router.replace('/login')` e `router.refresh()`).
- A página de perfil só aceita funcionário: `app/(funcionario)/perfil/page.tsx:8` (`requirePageUser('employee')`).

**Sugestão:**
- Transformar o avatar em botão que abre um menu pequeno: nome, e-mail, nível (N1/N2), "Meu perfil" e "Sair".
- Perfil do analista: ou uma rota `/console/perfil`, ou tornar a página de perfil comum aos dois papéis, mostrando
  também o nível de suporte.
- Teste: um E2E "analista sai do console e volta para /login" e outro "analista abre o próprio perfil".

---

## 2. Botões que não fazem nada (alta) — ✅ feito em 04/11

> - Lupa: busca na conversa aberta, com destaque, "n de m", Enter/Shift+Enter e Esc.
> - "Outros chamados": a linha abre o detalhe, com dados e histórico. Rota nova `GET /tickets/:code/events` no
>   legado e `GET /api/v1/employees/:id/tickets/:code`.
> - "Disponível": ficou como selo, sem pílula.
> - A varredura achou mais um: "Manter conectado" no login não fazia nada. Agora, desmarcado, o cookie é da sessão
>   do navegador.
> - De brinde: `TicketsNotFoundError` vira 404 em toda a API, o que resolve o "confirmar rascunho com chamado
>   sumido → 500" do item 5.
>
> E2E em `e2e/console-controles.spec.ts`.

| Botão | Onde | O que deveria fazer |
|---|---|---|
| Lupa "Buscar na conversa" no topo da conversa do console | `components/console/ConsoleConversation.tsx:165`, um `<button>` sem `onClick` | Buscar texto nas mensagens da conversa aberta e destacar os resultados. Se não der tempo, **remover** o botão: botão morto é pior que botão ausente. |
| Linhas de "Outros chamados", com seta `>` | `components/console/EmployeeTickets.tsx:93-106`: é uma `div`, e a seta é decorativa | Abrir o detalhe do chamado (título, descrição, status, prazo, histórico de atualizações). Ou tirar a seta. |
| "Disponível" no topo da lista de conversas | `components/console/ConversationList.tsx:54` | Hoje é só um selo. Decidir se vira um seletor (Disponível / Ausente, que afetaria a fila "Para você") ou se fica como selo e perde a cara de botão. |
| Ícone de conversas no rail do console | `components/console/ConsoleFrame.tsx:55-66` (`span`) | Ok se for a única seção. Se o perfil do analista for uma tela própria, o rail vira navegação de verdade. |

### 2.1 Busca da lista de conversas do console não acha o que promete — ✅ feito em 04/11

> Regras da busca:
> - ignora acento e caixa (`translate` em SQL, sem depender da extensão `unaccent`);
> - nome casa no começo da palavra;
> - procura em todas as mensagens e nos chamados do funcionário, pelo legado (`GET /tickets/search`, com espera
>   de 800 ms; se o legado cair, a busca segue sem eles);
> - termo de até 3 letras só vale como palavra inteira no texto;
> - nome vem primeiro, e cada resultado mostra o motivo.
>
> Testes em `tests/integration/conversations/service.test.ts` ("busca da fila").

O campo diz "Pesquisar conversa ou chamado", mas a busca (`lib/conversations/queries.ts:116-121`) só olha três
coisas: o **nome** do funcionário, a **última mensagem** (`last_message_preview`) e o **chamado em foco**. Testado
em 04/11 pela API (`GET /api/v1/conversations?filter=all&q=…`):

| Busca | Esperado | Veio | Por quê |
|---|---|---|---|
| `fabio` | Fábio Nunes | nada | `ILIKE` diferencia acento |
| `vpn`, `809` | Ana Souza (a conversa toda foi sobre VPN, erro 809) | nada | só olha a última mensagem |
| `REQ-10460`, `Diretoria` | Carla Mendes (chamado dela; título do INC-20388) | nada | só o código do chamado em foco; título e outros chamados ficam fora |
| `ana` | Ana Souza | Ana **e Bruno** | a última mensagem do Bruno tem "analista" |

**Sugestão:**
- Ignorar acento e caixa: extensão `unaccent` do Postgres (`unaccent(nome) ILIKE unaccent('%termo%')`), ou uma
  coluna normalizada com o mesmo `normalizar()` de `lib/text/normalizar.ts`.
- Procurar em **todas as mensagens** da conversa (`EXISTS` em `messages` com `ILIKE`), não só na última.
- Chamados: os códigos e títulos dos chamados do funcionário (schema `tickets`), não só o chamado em foco.
- Nome: casar no começo das palavras (`ana` acha "Ana Souza", mas não "analista") ou ordenar com nome antes de
  conteúdo.
- Na lista, mostrar **por que** cada resultado apareceu (ex.: trecho da mensagem com o termo destacado), senão o
  analista não entende por que o Bruno apareceu.
- Testes de integração para cada linha da tabela acima (`tests/integration/conversations/`).
- Também conferir os chips de filtro (Todas / Para você / Com o agent / Minhas) combinados com a busca.

**Antes de fechar este item:** passar por todas as telas (login, chat, perfil, console e conversa) procurando qualquer
outra coisa que pareça clicável e não seja. Vale também deixar um teste E2E que clica em cada controle visível de
cada tela e confere que algo acontece.

---

## 3. Histórico: chamados e conversas anteriores (média) — ✅ feito em 04/11, com a sugestão abaixo

> - Tela "Meus chamados" (`/chamados`, `/chamados/:code`), com rotas novas `GET /api/v1/me/tickets[/:code]`.
> - Tool com `status: closed`, instrução nova e cenário `chamados-resolvidos` nos evals.
> - Dois achados no caminho:
>   - os chamados mostrados ao funcionário não contavam como fonte, e o guardrail de confiança limitava a 50%
>     (transferia por "baixa confiança" uma resposta certa);
>   - o prompt de decisão não via os cards.
> - Paginação com cursor por id (o antigo, por `created_at` em ms, pulava mensagens).
>
> E2E em `e2e/historico.spec.ts`.

**O que acontece:**
- O funcionário não tem tela para ver os próprios chamados. Hoje só dá para ver pelo chat ("qual o status do meu
  chamado?"), e esse seletor mostra **apenas os em andamento**: `lib/agent-engine/tools/buscar-meus-chamados.ts`
  usa `status: 'open'` por padrão.
- Chamados resolvidos ou antigos só aparecem se o modelo decidir usar `status: 'all'`, e nada testa isso.
- A conversa mostra só as **últimas 50 mensagens**, sem "carregar mais" (`app/api/v1/conversations/current/route.ts:11`
  e `app/api/v1/conversations/[id]/messages/route.ts:33`; o `next_cursor` já vem na resposta, mas ninguém usa).
- A lista completa de chamados de um funcionário existe só no console do analista
  (`GET /api/v1/employees/:id/tickets`).

**Decidir antes de codar:** o que "histórico" deve mostrar. Os chamados (todos, inclusive resolvidos)? As conversas
anteriores com o assistente? Ou os dois?

**Sugestão (minha):**
1. Tela **"Meus chamados"** no menu lateral do funcionário, abaixo de "Atendimento", com filtro
   *Em andamento / Resolvidos* e clique abrindo o detalhe. Precisa de um endpoint do funcionário para os próprios
   chamados; o do analista é `employees/:id/tickets` e é restrito a analistas.
2. No chat, quando o funcionário pedir "chamados antigos", "resolvidos" ou "histórico", o agent usa `status: 'all'`.
   Ajustar a descrição da tool e as instruções, com um cenário novo no `evals/cenarios.ts`.
3. "Carregar mensagens anteriores" no topo do chat e da conversa do console, usando o `next_cursor`.

Essa tela não existe no protótipo (`referencias/nexo.pen`); desenhar no mesmo estilo dos cards do chat e citar no
README como adição.

---

## 4. Pendências do plano que dependem de decisão (fora do código)

- **Task 25:** criar o repositório público `desafio-tecnico-nexo-assist` no GitHub, dar push e ver o CI verde
  (`.github/workflows/ci.yml`). Antes, decidir se `referencias/` (o PRD e o `.pen` do desafio) entra num repo público.
- **Task 26:** deploy na VPS (DNS no Registro.br, bloco no Caddy, banco no Supabase). Antes:
  - gerar um `SESSION_SECRET` novo (`openssl rand -base64 48`);
  - se usar `LLM_DAILY_BUDGET_CENTS`, preencher os dois `LLM_PRICE_*`, senão o app não sobe;
  - decidir se a URL pública precisa de alguma barreira: hoje qualquer senha entra, inclusive como analista.

---

## 5. Pendências menores da revisão de código (baixa)

Vieram da revisão final do branch inteiro e não bloqueiam. Estão também no ledger
`.superpowers/sdd/2026-11-03-nexo-assist/progress.md` (linhas `Final: minor (deferred)`).

- Analista assume bem no meio de um turno do agent: o funcionário vê erro numa mensagem que foi entregue, e o run
  fica como "running" (`lib/agent-engine/agent/run-turn.ts`, `createHandoff` depois de `getConversation`).
- Editar um rascunho depois de uma confirmação cujas respostas se perderam pode marcá-lo como falho, mesmo com o
  chamado criado (`lib/drafts/service.ts:84-104`).
- ~~Confirmar um rascunho cujo chamado alvo não existe mais no legado devolve 500 em vez de 404/422.~~ Agora 404
  (`tests/integration/api/drafts.test.ts`). O rascunho continua pendente.
- O SSE pode pular um evento commitado fora de ordem (`app/api/v1/events/route.ts`).
- Depois de qualquer erro do SSE, a tela fica em polling de 3 s até recarregar (`lib/client/use-events.ts`).
- O formulário de edição do rascunho não deixa mudar "impede de trabalhar" e "compromisso hoje", e o seletor de tipo
  fica sob o rótulo "Prioridade" (`components/chat/DraftCard.tsx`).
- Dois aparelhos logados alternando zeram o contador da sessão (`lib/conversations/service.ts`, `getOrCreateCurrent`).
- O `SESSION_SECRET` do `.env.example` é aceito em produção (o README avisa para gerar outro).
- A checagem de chamado duplicado depende só do prompt; não há checagem determinística por categoria antes de criar.
- A transferência pelo limite de 30 mensagens vai sem resumo do caso (só "confira o histórico").
- O limite de login usa o `X-Forwarded-For` e pode ser burlado quando a porta 3000 fica exposta (`docker compose --profile full`).

---

## Como trabalhar cada item

Para cada correção: primeiro um teste que falha mostrando o problema, depois o código, depois `pnpm check`,
`pnpm test:int` e `pnpm test:e2e` verdes. Commit em Conventional Commits. Se mexer em tela, atualizar as capturas
(`e2e/visual.spec.ts` gera em `test-results/telas/`; copiar para `docs/telas/`) e o README.
