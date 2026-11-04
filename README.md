# Nexo Assist

Assistente de service desk de TI da Nexo: o funcionário descreve o problema numa conversa, o agent consulta os
chamados dele, busca na central de ajuda, monta um rascunho de chamado com a prioridade do Anexo A e, quando
precisa, passa a conversa para um analista com um resumo do caso. Cada turno deixa registrado **o que o agent
entendeu, o que fez, por quê e com que confiança** — e o funcionário e o analista conseguem ler isso na tela.

Stack: Next.js 16 (App Router) · React 19 · Mastra + AI SDK 7 · DeepSeek (`deepseek-flash`) · Postgres + Drizzle ·
serviço de chamados legado simulado em Hono · Vitest + Playwright.

---

## 1. Como rodar

Pré-requisitos: Node 22+, pnpm 12 (`corepack enable` usa a versão do `packageManager`), Docker.

```bash
cp .env.example .env          # funciona como está: modelo roteirizado, sem chave
docker compose up -d db       # Postgres 16 na 5432 (cria nexo, nexo_test e nexo_e2e)
pnpm i
pnpm db:migrate
pnpm db:seed
pnpm dev                      # web em http://localhost:3000 + serviço de chamados na 4001
```

Porta 3000 ocupada? `PORT=3005 pnpm dev`.

**Com o modelo real:** no `.env`, `LLM_PROVIDER=deepseek` e `DEEPSEEK_API_KEY=...`. Para medir custo, preencha
`LLM_PRICE_IN_CENTS_PER_MTOK` e `LLM_PRICE_OUT_CENTS_PER_MTOK` com os preços atuais do provedor, em centavos
por milhão de tokens. Eles ficam vazios no `.env.example`; sem os dois valores, o custo não é calculado.

**Tudo em containers** (web + chamados + banco, como em produção):

```bash
docker compose --profile full up --build      # http://localhost:3000
pnpm smoke http://localhost:3000 --restart    # login, conversa, rascunho e persistência após restart
```

### Usuários do seed

Todos os usuários do seed entram com a senha **`nexo2026`**.

| Pessoa         | E-mail                        | Papel                     | O que tem no seed                                                                                                      |
| -------------- | ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Ana Souza      | `ana.souza@nexo.com.br`       | Funcionária (Financeiro)  | INC-20311 vencido, INC-20298 aberto (SharePoint), REQ-10442 (monitor), atendimento resolvido sobre o Outlook há 3 dias |
| Carla Mendes   | `carla.mendes@nexo.com.br`    | Funcionária (Comercial)   | Conversa transferida, esperando uma analista                                                                           |
| Bruno Tavares  | `bruno.tavares@nexo.com.br`   | Funcionário (Operações)   | Conversa transferida por baixa confiança                                                                              |
| Diego Ramos    | `diego.ramos@nexo.com.br`     | Funcionário (Marketing)   | Conversa com o agent sobre instalar o Figma                                                                            |
| Elisa Prado    | `elisa.prado@nexo.com.br`    | Funcionária (Jurídico)    | Conversa com o agent que criou o INC-20519                                                                            |
| Fábio Nunes    | `fabio.nunes@nexo.com.br`     | Funcionário (Logística)   | Atendimento resolvido pelo agent sobre a impressora                                                                    |
| Gabriela Rocha | `gabriela.rocha@nexo.com.br`  | Funcionária (Comercial)   | Atendimento resolvido pelo agent sobre o Wi-Fi                                                                         |
| Rafael Lima    | `rafael.lima@nexo.com.br`     | Analista N2               | Console do analista                                                                                                    |
| Juliana Costa  | `juliana.costa@nexo.com.br`   | Analista N1               | Console do analista                                                                                                    |

Roteiro curto para ver tudo: entre como **Ana** e mande _"Meu notebook não conecta na VPN, erro 809"_ → responda
_Windows 11_ → _"Só eu, tenho reunião às 14h"_. Clique na linha de status do agent para abrir o painel
**"Por que o Nexo fez isso?"**. Depois mande _"quero falar com um analista"_, entre como **Rafael** em outra
janela e assuma a conversa.

---

## 2. Arquitetura

```
┌─────────────────────────────── web (Next.js 16, um processo) ───────────────────────────────┐
│  UI (React)                  │  API /api/v1 (Route Handlers)         │  Agent (Mastra)        │
│  /login                      │  POST conversations/:id/messages      │  runTurn               │
│  /atendimento  (funcionário) │       → stream (AI SDK UI messages)   │   ├ tools (7)          │
│  /atendimento/[id]           │  GET  me/conversations/:id            │   ├ decisão declarada  │
│  /perfil · /chamados         │  POST drafts/:id/confirm (idempotente)│   ├ rules/ (puras)     │
│  /console      (analista)    │  GET  conversations (fila) · claim ·  │   ├ triggers/          │
│                              │       release · close · handoffs      │   └ guardrails/        │
│                              │  GET  events (SSE)  · ai/runs/:id     │                       │
└──────────────────────────────┴───────────────────────────────────────┴───────────┬────────────┘
             │ Drizzle                                                             │ HTTP tipado:
             ▼                                                                     │ retry curto +
   ┌──────────────────────────┐                        ┌───────────────────────────▼──────────┐
   │ Postgres                 │◄───── schema tickets ──│ services/tickets (Hono, processo     │
   │  app: atendimentos,       │                        │ próprio): GET/POST/PATCH /tickets,   │
   │  mensagens, sessões,      │                        │ /transfer, idempotência, falhas      │
   │  rascunhos, passagens,    │                        │ simuladas e /_chaos/outage           │
   │  ai_agent_runs, llm_calls,│                        │                                      │
   │  event_log · mastra       │                        └──────────────────────────────────────┘
   └──────────────────────────┘
```

- **O serviço de chamados é um processo separado** porque o PRD diz que ele é legado e instável. Assim a
  instabilidade é real: dá para derrubá-lo (`POST /_chaos/outage?seconds=30`) e ver a UI avisar com honestidade,
  guardar o rascunho e confirmar depois. O agent só fala com ele pela borda `lib/agent-engine/edge/tickets`
  (retry curto, disjuntor, erros tipados).
- **Pastas:** `lib/rules` (Anexo A em funções puras) · `lib/agent-engine` (agent, tools, `triggers`, guardrails,
  borda do LLM e dos chamados) · `lib/conversations` (`attendance.ts`: ciclo de vida e sessão; estado agent × analista)
  · `lib/contracts` (Zod compartilhado entre API, UI e serviço) · `services/tickets` · `app/` (telas e rotas).
- **Língua:** o código (nomes, arquivos, tools que o modelo vê, logs) é em inglês; o que a pessoa lê (telas,
  URLs, mensagens da API), o prompt do agent, os comentários e os nomes dos testes ficam em português.
- **Tempo real do console:** SSE sobre o `event_log` (com `Last-Event-ID`), caindo para polling se o
  `EventSource` falhar.

---

## 3. Como o agent decide o que fazer

A divisão é: **o modelo interpreta, o código decide o que tem regra.**

| Quem                           | Decide o quê                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelo (DeepSeek)              | O que o funcionário quer, que pergunta fazer, que artigo serve, que dados pôr no rascunho                                                                                                                                                                                                                                                                                                                                                                               |
| Código (`lib/rules`)           | Prioridade e prazo (Anexo A), horário útil, chamado vencido, janela de reabertura de 7 dias, transições agent × analista                                                                                                                                                                                                                                                                                                                                                |
| Código (`triggers/`)           | Quando transferir: pedido explícito, Crítica, confiança abaixo de 0,6, limite de 30 mensagens da sessão, teto de gasto do dia; oferta de analista para chamado vencido                                                                                                                                                                                                                                                                                                  |
| Código (`guardrails/` e tools) | O agent prometeu um analista sem transferir → o sistema transfere. Disse que criou um chamado → aviso "o chamado ainda não foi criado". Fonte que nenhuma tool retornou → descartada. Rascunho de chamado novo com outro aberto na mesma categoria → recusado até o agent atualizar o existente ou dizer que é outro problema. `build_draft` de atualização/reabertura é recusado como `ticket_with_analyst` quando o chamado já está com analista em outro atendimento |
| Funcionário                    | Criar, atualizar ou reabrir chamado: **só o clique em Confirmar** cria (idempotente)                                                                                                                                                                                                                                                                                                                                                                                    |

**Tools** (identidade sempre da sessão, nunca do modelo): `search_articles`, `list_my_tickets`,
`get_ticket`, `build_draft` (o modelo informa _quem é afetado / impede de trabalhar / compromisso hoje_; a
prioridade é calculada), `offer_options` (opções rápidas), `transfer_to_analyst` e `mark_resolved` (encerra
depois que o funcionário confirma que a resposta resolveu).

**Um turno** (`lib/agent-engine/agent/run-turn.ts`):

1. Portão: se um analista está com a conversa, o modelo não é chamado. Pedido explícito de analista, limite
   da sessão e teto de gasto também transferem sem chamar o modelo.
2. O agent roda com até 6 passos de tool; cada tool emite a ação (com tempo e resultado) e os cards no stream.
3. **Decisão declarada:** uma chamada curta e estruturada (Zod) registra entendimento, ação, confiança, porquê,
   regras e fontes. Se o modelo devolver lixo, a decisão fica `null` ("não registrada") — ausente ≠ vazia.
4. Ajustes determinísticos: fontes vêm das tools (não do texto do modelo); a ação vem do que as tools fizeram
   (transferir vence; rascunho define criar / atualizar / reabrir); dúvida respondida sem fonte tem confiança
   limitada a 50%.
5. Gatilhos e guardrails; tudo fica em `ai_agent_runs` + `llm_calls` (tokens, custo, latência).

---

## 4. Como garanti a qualidade das decisões

Duas perguntas diferentes, dois instrumentos:

- **O pipeline faz o que deve?** Testes com um **modelo roteirizado** (`lib/agent-engine/edge/llm/scripted-model.ts`):
  um `LanguageModelV4` determinístico que segue roteiros por mensagem (inclusive tool calls, falhas e decisões
  inválidas). Ele existe para que unitários, integração e E2E rodem sem chave, sem custo e sem variação — eles
  provam regras, tools, guardrails, persistência e UI, não o julgamento do modelo.
- **O modelo julga bem?** **Evals com o modelo real** (`evals/`): 15 cenários das histórias do PRD, cada um 3×,
  contra o pipeline real. Critérios verificáveis no banco (tools chamadas, ação, rascunho, prioridade, fontes,
  transferência) — sem juiz LLM.

### Pirâmide de testes

| Camada           | Comando                       | O que cobre                                                                                                                                                                                                                                 | Resultado                 |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Typecheck + lint | `pnpm typecheck && pnpm lint` | TS estrito, React hooks                                                                                                                                                                                                                     | 0 erros, 0 avisos         |
| Unitários        | `pnpm test`                   | Anexo A, prazos em horário útil, reabertura, máquina de estados, gatilhos, guardrails, busca, contratos, componentes                                                                                                                        | **279/279** (34 arquivos) |
| Integração       | `pnpm test:int` (Postgres)    | `runTurn` com memória e banco reais, API com sessão e papéis, serviço de chamados, idempotência, SSE                                                                                                                                        | **172/172** (17 arquivos) |
| E2E              | `pnpm test:e2e` (Playwright)  | As histórias do PRD de ponta a ponta: abrir, consultar, complementar, transparência, privacidade, fora de escopo, transferência e console, instabilidade do legado, limite da sessão, continuidade, conta e controles do console, histórico | **54/54** (~2 min)        |
| Evals            | `pnpm eval` (DeepSeek)        | Julgamento do modelo nas 15 histórias                                                                                                                                                                                                       | **45/45 (100%)**          |

`pnpm check` roda typecheck, lint e unitários juntos. Números da última rodada completa, em 04/11/2026.

### Resultado dos evals (`deepseek-flash`, 15 cenários × 3)

Rodada de 04/11/2026: **45/45 (100%)**, incluindo `duvida-resolvida` (3/3), que verifica o encerramento depois
da confirmação do funcionário. Os cenários e os resultados de cada repetição estão em
[`evals/resultados.md`](evals/resultados.md).

---

## 5. Transparência

Cada mensagem do agent tem uma **linha de status** com as ações reais do turno ("✓ consultou seus chamados ·
✓ buscou na central"), que mostra spinner durante o stream e ⚠ quando o sistema de chamados está lento e o agent
está tentando de novo. Clicar nela abre o painel **"Por que o Nexo fez isso?"**:

- **Entendi que…** — resumo e as palavras do funcionário entre aspas.
- **Então eu…** — a ação e uma barra de confiança (verde ≥ 80%, amarela 60–80%, vermelha < 60%).
- **Porque…** — o porquê em linguagem simples e as regras aplicadas (ex.: "Alta: impede uma pessoa de trabalhar
  ou há compromisso no mesmo dia · prazo 4 horas úteis").
- **Consultei** — cada tool com resultado e tempo; artigos e chamados citados.
- Rodapé: modelo · tokens · custo · latência.

No **console do analista** a mesma trilha aparece em cada mensagem do agent, e a passagem vem com um briefing
(palavras do funcionário, leitura do agent, o que já foi tentado, confiança, chamado em foco e prazo).

| Painel de decisão                                   | Console — conversa transferida                                       |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| ![Painel de decisão](docs/telas/painel-decisao.png) | ![Console, conversa transferida](docs/telas/console-transferida.png) |

---

## 6. Modelo e custo por conversa

**DeepSeek `deepseek-flash`** via `@ai-sdk/deepseek` no Mastra. Escolhido por custo baixo e bom uso de tools em
português; `MODEL_ID` e `LLM_PROVIDER` são trocáveis por env (a borda `edge/llm` isola o provedor).

Consumo médio nesta rodada: **13.044 tokens de entrada e 1.102 de saída** por execução (45 execuções, de 1 a 3
turnos). O custo não foi medido porque `LLM_PRICE_IN_CENTS_PER_MTOK` e `LLM_PRICE_OUT_CENTS_PER_MTOK` não estavam
configuradas. Com esses valores no `.env`, cada chamada grava `cost_cents` em `llm_calls` e o painel mostra o
custo do turno.

---

## 7. Principais trade-offs

- **Busca na central sem embeddings:** palavras-chave com pesos (3× tags, 2× título, 1× corpo), corte de ruído e `applies_to`. Com
  uma dúzia de artigos isso acerta e é explicável; com centenas, iria para busca semântica.
- **Horário útil sem feriados:** seg–sex, 8h–18h, America/Sao_Paulo. Feriados ficariam numa tabela.
- **Rate limit em memória** (janela deslizante): vale para uma instância, que é o deploy. Com réplicas, iria
  para o Postgres ou Redis.
- **DeepSeek e privacidade:** o texto das conversas vai para a API da DeepSeek. Para dados sensíveis de verdade,
  trocar por um provedor com contrato de retenção zero (o provedor é uma env).
- **Chamada extra de decisão por turno:** custa tokens a mais (já incluídos no custo da §6), mas garante uma decisão estruturada e
  validada em todo turno, em vez de depender de o modelo lembrar de chamar uma tool opcional.
- **Atendimentos em paralelo:** cada funcionário pode ter vários atendimentos com analistas e, no máximo, um com
  o agent. Se já houver outro atendimento com o agent, devolver o atendimento do analista junta os históricos e
  registra uma nota com o que foi feito. O funcionário alterna entre os históricos pelo seletor e pode abrir outro
  assunto quando um atendimento está com um analista.
- **Sessão de 30 mensagens:** o limite existe para o custo do modelo e soma as mensagens do funcionário em todos
  os atendimentos daquela sessão de login. Ao bater 30, o atendimento vai para um analista; mensagens para o
  analista não contam no limite, e o funcionário pode abrir outro atendimento com o agent.
- **Senhas:** o banco guarda só o hash (scrypt do `node:crypto`, salt de 16 bytes por usuário, formato
  `scrypt$N$r$p$salt$hash` na coluna `users.password_hash`). O login confere com `timingSafeEqual` e responde
  igual para e-mail inexistente e senha errada ("E-mail ou senha incorretos"), inclusive no tempo: e-mail
  inexistente também paga uma conferência de hash. Usuário sem hash não entra. A senha não vai para log nem
  auditoria. Todos os usuários do seed têm a mesma senha de demonstração; "Esqueci minha senha" e "Redefinir senha"
  continuam simulados. Num banco anterior à coluna, o start do container define a senha de demonstração para os
  usuários do seed que estão sem hash.

### Divergências e adições em relação ao protótipo e ao PRD

Referências: [protótipo no Pencil](referencias/nexo.pen) e [PRD v5](referencias/Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf).

- "Encaminhei para o Suporte N2… em até **2 h úteis**" e "Agent pausado · até 12:05": seguimos o Anexo A — o
  prazo da passagem é o da prioridade do chamado em foco (sem chamado: Alta, 4 h úteis).
- A vitrine do login diz "abri o chamado"; no produto o chamado só é criado pelo clique em Confirmar. A vitrine
  é ilustrativa, assim como os números dela ("8 s primeira resposta", "72% resolvidos sem fila", "6 analistas
  online").
- A Tela 5 tem 1567 px de largura no protótipo (acidental); foi implementada no grid de 1440 px da Tela 4.
- No Anexo B do PRD, o REQ-10442 aparece atualizado "há 1 semana". O seed usa "há 2 dias" para não colocar o
  chamado de prioridade Baixa exatamente no limite de 5 dias úteis.
- O seletor de chamados ordena pela última atualização, não pela ordem ilustrativa do protótipo.
- "digitando…" na lista do console não foi implementado.
- **Adição:** no protótipo o avatar do analista, no rail do console, não faz nada. Aqui ele abre um menu com nome,
  e-mail, nível (N1/N2), "Meu perfil" (`/console/perfil`, o mesmo perfil do funcionário mais o nível de suporte) e
  "Sair".
- **Adição:** controles do protótipo que não tinham comportamento definido passaram a funcionar no console:
  - a lupa do topo busca nas mensagens da conversa aberta ("1 de 3", Enter/Shift+Enter, Esc fecha);
  - as linhas de "Outros chamados" abrem o detalhe do chamado (dados e histórico do legado, via
    `GET /tickets/:code/events`).
  - "Disponível" ficou como selo, sem cara de botão: a disponibilidade não muda a fila, porque todos os analistas
    veem todas as transferências.
- **Adição:** a busca da lista ("Pesquisar conversa ou chamado"):
  - ignora acento e caixa;
  - casa nome no começo da palavra;
  - procura em todas as mensagens e nos códigos e títulos dos chamados do funcionário (pelo serviço de chamados,
    `GET /tickets/search`; se ele cair, a busca segue só com nome e mensagens);
  - termos de até 3 letras só valem como palavra inteira no texto (`ana` não acha "analista");
  - resultados por nome vêm primeiro, e cada resultado mostra por que apareceu (o chamado ou o trecho da mensagem).
- **Adição — histórico:**
  - tela **Meus chamados** (`/chamados`), com abas "Em andamento" e "Resolvidos";
  - o detalhe usa o mesmo card do chat, mais responsável, prazo e o histórico do legado;
  - "Falar sobre este chamado" abre o atendimento com `Sobre o INC-…: ` no composer;
  - no chat, "meus chamados resolvidos/antigos" lista só os encerrados (`status: closed` na tool);
  - "Carregar mensagens anteriores" no topo do chat e da conversa do console. O cursor é o id da mensagem, para não
    pular mensagens gravadas no mesmo instante.
- **Adição — atendimentos separados:** o protótipo mostra uma conversa contínua. Esta implementação mantém vários
  atendimentos com analistas e até um com o agent, com seletor, ligação aos chamados e junção ao devolver quando já
  existe um atendimento ativo com o agent.
- "Manter conectado neste computador" agora vale: desmarcado, o cookie é da sessão do navegador.

### Telas (capturas do E2E, `e2e/visual.spec.ts`)

| Tela do protótipo                            | Implementação                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| 1 — Identificação                            | ![Login](docs/telas/login.png)                                         |
| 2 — Chat, novo chamado                       | ![Chat, novo chamado](docs/telas/chat-novo-chamado.png)                |
| 3 — Chat, consulta e transferência           | ![Chat, consulta](docs/telas/chat-consulta.png)                        |
| 4 — Console, conversa transferida            | ![Console, transferida](docs/telas/console-transferida.png)            |
| 5 — Console, atendimento assumido            | ![Console, assumida](docs/telas/console-assumida.png)                  |
| 6 — Meu perfil                               | ![Meu perfil](docs/telas/perfil.png)                                   |
| Adição — menu do analista                    | ![Console, menu da conta](docs/telas/console-menu-conta.png)           |
| Adição — perfil do analista                  | ![Console, perfil](docs/telas/console-perfil.png)                      |
| Adição — busca na lista e na conversa        | ![Console, busca](docs/telas/console-busca.png)                        |
| Adição — detalhe do chamado                  | ![Console, detalhe do chamado](docs/telas/console-detalhe-chamado.png) |
| Adição — Meus chamados                       | ![Meus chamados](docs/telas/meus-chamados.png)                         |
| Adição — detalhe de um chamado (funcionário) | ![Detalhe do chamado](docs/telas/meu-chamado-detalhe.png)              |
| Adição — atendimentos do funcionário         | ![Atendimentos do funcionário](docs/telas/chat-atendimentos.png)       |

---

## 8. O que faria com mais tempo

- Busca semântica na central, com avaliação de recall.
- Feriados no cálculo de prazo; SLA pausado fora do horário visível na UI.
- Rate limit e disjuntor compartilhados (Redis) para rodar mais de uma réplica.
- Paginação na fila do console e busca com índice (trigram) quando houver muitas conversas; "digitando…"; o `EventSource` voltar para SSE depois de cair para
  polling.
- Evals rodando no CI em PRs que mexem no prompt, com orçamento fixo.
- Login real (SSO da empresa) no lugar da senha local, ou ao menos troca e redefinição de senha de verdade.

---

## 9. Deploy

- **Imagens** buildadas no GitHub Actions e publicadas no GHCR (`.github/workflows/images.yml`); o servidor só
  faz `pull` — nada de `next build` na VPS.
- **Produção:** `docker-compose.prod.yml` com `nexo-web` (384 MB) e `nexo-tickets` (128 MB, sem porta
  publicada), atrás do Caddy da VPS, que termina o HTTPS. Banco: Postgres gerenciado. O web aplica as migrations
  no start.
- **Segredos:** a chave do modelo e o `SESSION_SECRET` ficam só no `.env` do servidor, nunca no repositório nem no
  cliente; o navegador só fala com a API do app. Gere um segredo novo para produção (`openssl rand -base64 48`) —
  o do `.env.example` é público.
- **Proteção:** rate limit de mensagens por funcionário (`RATE_LIMIT_PER_MINUTE`, 429 com `Retry-After` antes de
  abrir o stream) e de login por IP (o IP vem da entrada do `X-Forwarded-For` que o Caddy acrescentou,
  `TRUST_PROXY_HOPS=1`; o que o cliente escreve à esquerda é ignorado); **teto diário de gasto** (`LLM_DAILY_BUDGET_CENTS`, exige os dois `LLM_PRICE_*`; sem eles o app não sobe) — acima dele o agent
  para de chamar o modelo e transfere para um analista; cabeçalhos de segurança (`X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`) e sem `X-Powered-By`.
- **CI** (`.github/workflows/ci.yml`): typecheck + lint + unitários, integração com Postgres, E2E.
