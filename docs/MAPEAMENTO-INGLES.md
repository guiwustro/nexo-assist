# Mapeamento: código em inglês, textos em português

Levantado em 04/11/2026 sobre o branch `fix/proximos-passos`. O objetivo é que tudo o que é **código** fique em inglês
(nomes de variáveis, funções, tipos, arquivos, pastas, ids internos), e que tudo o que o **usuário lê** continue em
português (rótulos, mensagens, textos do agent, conteúdo do seed).

Os números vêm de um script que lê o código com a API do compilador TypeScript (declarações de variável, função,
parâmetro, tipo e propriedade), quebra os nomes em palavras e confere cada palavra num dicionário PT→EN. A tabela de
identificadores (seção 7) foi gerada assim e revisada à mão. O mesmo mapa está em `docs/mapeamento-ingles.json`, para
servir de entrada ao script de renomeação (seção 8).

## Resumo

| O quê | Quantidade | Esforço |
|---|---|---|
| Identificadores em português (variáveis, funções, tipos, propriedades) | 390, em ~120 arquivos | médio; mecânico com ts-morph |
| Arquivos e pastas com nome em português | 48 arquivos, 4 pastas | baixo (`git mv` + imports) |
| Nomes das tools que o modelo vê (`buscar_meus_chamados` etc.) | 6 | médio: mexe no prompt, nos evals e em dados gravados |
| Logs, ids de roteiro, chaves internas | ~25 | baixo |
| Comentários em português | ~240 linhas | decidir (seção 3) |
| Nomes de teste (`it`, `describe`, `test`) em português | 213 de 365 | decidir (seção 3) |

## 1. A regra

**Inglês (código):**
- nomes de variável, função, componente, hook, tipo, constante, propriedade de objeto interno, parâmetro;
- nomes de arquivo e pasta;
- nomes das tools expostas ao modelo e ids internos (roteiros do modelo roteirizado, chaves de mapa);
- mensagens de log (`console.warn/error`): são para quem opera, não para o funcionário.

**Português (produto):**
- tudo que aparece na tela: rótulos, botões, avisos, estados vazios, textos de erro devolvidos pela API em `message`;
- o prompt do agent (`NEXO_INSTRUCTIONS`, prompt de decisão), as respostas e os textos de regra (`rules_applied`):
  o agent fala português com o funcionário;
- conteúdo do seed (chamados, artigos, conversas) e documentação (`README.md`, `ANALISE.md`, `docs/`);
- o relatório dos evals (`evals/resultados.md`).

## 2. O que já está em inglês e não muda

- **Banco:** todas as tabelas e colunas (`conversations`, `focus_ticket_code`, `support_level`…) e os valores de enum
  (`ai_handling`, `pending`, `requested_human`, `network_vpn`…).
- **Variáveis de ambiente:** `DATABASE_URL`, `LLM_DAILY_BUDGET_CENTS` etc.
- **API:** caminhos `/api/v1/...`, campos do JSON e códigos de erro (`ticket_not_found`, `rate_limited`).
- **Contratos Zod** (`lib/contracts`), partes de mensagem (`ticket_card`, `draft_card`) e eventos do SSE.
- Boa parte dos módulos novos (`lib/tickets/views.ts`, `lib/client/message-pages.ts`, `components/tickets/*`).

## 3. Decisões antes de começar

1. **URLs que o usuário vê** (`/atendimento`, `/perfil`, `/chamados`, `/console/perfil`, `?sobre=`, `?aba=resolvidos`).
   Aparecem na barra de endereço, então são texto de produto.
   **Minha sugestão: manter em português.** O grupo de rotas `app/(funcionario)` não aparece na URL e vira
   `app/(employee)`.
2. **Comentários.** Hoje explicam regras de negócio em português ("Anexo A", "horário útil").
   **Sugestão: traduzir numa fase separada, no fim.** É o maior volume e o que menos quebra.
3. **Nomes dos testes** (`it('a 30ª atinge o limite…')`). Muitos citam o texto da tela entre aspas.
   **Sugestão: traduzir junto com os comentários, mantendo em português só o trecho citado da UI**
   (ex.: `it('shows "Nada encontrado" when nothing matches')`).
4. **Nomes das tools do modelo.** Trocar `buscar_meus_chamados` por `list_my_tickets` é código, mas o modelo vê o nome.
   Os efeitos estão na seção 5. **Sugestão: trocar, e rodar os evals completos depois.**

## 4. Pastas e arquivos

| Hoje | Proposta |
|---|---|
| `lib/regras/` | `lib/rules/` |
| `lib/regras/conversa-estado.ts` | `lib/rules/conversation-state.ts` |
| `lib/regras/horario-util.ts` | `lib/rules/business-hours.ts` |
| `lib/regras/prazo.ts` | `lib/rules/deadline.ts` |
| `lib/regras/prioridade.ts` | `lib/rules/priority.ts` |
| `lib/regras/reabertura.ts` | `lib/rules/reopening.ts` |
| `lib/regras/vencido.ts` | `lib/rules/overdue.ts` |
| `lib/agent-engine/gatilhos/` | `lib/agent-engine/triggers/` |
| `lib/agent-engine/gatilhos/transferencia.ts` | `lib/agent-engine/triggers/transfer.ts` |
| `lib/agent-engine/conhecimento/` | `lib/agent-engine/knowledge/` |
| `lib/agent-engine/conhecimento/busca.ts` | `lib/agent-engine/knowledge/search.ts` |
| `lib/agent-engine/agent/decisao.ts` | `lib/agent-engine/agent/decision.ts` |
| `lib/agent-engine/agent/rotulos.ts` | `lib/agent-engine/agent/labels.ts` |
| `lib/agent-engine/guardrails/acao-alucinada.ts` | `lib/agent-engine/guardrails/hallucinated-action.ts` |
| `lib/agent-engine/guardrails/confianca.ts` | `lib/agent-engine/guardrails/confidence.ts` |
| `lib/agent-engine/guardrails/promessa-analista.ts` | `lib/agent-engine/guardrails/analyst-promise.ts` |
| `lib/agent-engine/tools/buscar-artigos.ts` | `lib/agent-engine/tools/search-articles.ts` |
| `lib/agent-engine/tools/buscar-meus-chamados.ts` | `lib/agent-engine/tools/list-my-tickets.ts` |
| `lib/agent-engine/tools/montar-rascunho.ts` | `lib/agent-engine/tools/build-draft.ts` |
| `lib/agent-engine/tools/oferecer-opcoes.ts` | `lib/agent-engine/tools/offer-options.ts` |
| `lib/agent-engine/tools/transferir.ts` | `lib/agent-engine/tools/transfer-to-analyst.ts` |
| `lib/agent-engine/tools/ver-chamado.ts` | `lib/agent-engine/tools/get-ticket.ts` |
| `lib/text/normalizar.ts` | `lib/text/normalize.ts` |
| `lib/text/trechos.ts` | `lib/text/matches.ts` |
| `lib/db/busca.ts` | `lib/db/search.ts` |
| `lib/client/use-sair.ts` | `lib/client/use-logout.ts` |
| `app/(funcionario)/` | `app/(employee)/` (as pastas de URL dentro ficam; ver decisão 1) |
| `evals/cenarios.ts` | `evals/scenarios.ts` |
| `e2e/abrir-chamado.spec.ts` | `e2e/open-ticket.spec.ts` |
| `e2e/consultar-chamado.spec.ts` | `e2e/ticket-status.spec.ts` |
| `e2e/console-controles.spec.ts` | `e2e/console-controls.spec.ts` |
| `e2e/continuidade.spec.ts` | `e2e/continuity.spec.ts` |
| `e2e/fora-de-escopo.spec.ts` | `e2e/out-of-scope.spec.ts` |
| `e2e/historico.spec.ts` | `e2e/history.spec.ts` |
| `e2e/instabilidade.spec.ts` | `e2e/instability.spec.ts` |
| `e2e/limite-sessao.spec.ts` | `e2e/session-limit.spec.ts` |
| `e2e/privacidade.spec.ts` | `e2e/privacy.spec.ts` |
| `e2e/transferencia.spec.ts` | `e2e/handoff.spec.ts` |
| `e2e/transparencia.spec.ts` | `e2e/transparency.spec.ts` |
| `tests/unit/regras/` | `tests/unit/rules/` (e cada `*.test.ts` com o nome do módulo novo) |
| `tests/unit/agent/busca.test.ts` | `tests/unit/agent/knowledge-search.test.ts` |
| `tests/unit/agent/gatilhos.test.ts` | `tests/unit/agent/triggers.test.ts` |
| `tests/unit/agent/rotulos.test.ts` | `tests/unit/agent/labels.test.ts` |
| `tests/unit/regras/trechos.test.ts` | `tests/unit/text/matches.test.ts` |
| `tests/integration/agent/montar-rascunho.test.ts` | `tests/integration/agent/build-draft.test.ts` |

## 5. Nomes das tools (o modelo vê)

| Hoje | Proposta |
|---|---|
| `buscar_artigos` | `search_articles` |
| `buscar_meus_chamados` | `list_my_tickets` |
| `ver_chamado` | `get_ticket` |
| `montar_rascunho` | `build_draft` |
| `oferecer_opcoes` | `offer_options` |
| `transferir_para_analista` | `transfer_to_analyst` |

O que muda junto:
- `NEXO_INSTRUCTIONS` cita as tools pelo nome; o texto continua em português, só os nomes mudam.
- `lib/agent-engine/agent/rotulos.ts` (rótulo da status line por tool) e o modelo roteirizado
  (`edge/llm/scripts.ts`).
- `evals/cenarios.ts` (`tools_incluem`, `tools_excluem`).
- **Dados gravados:** `ai_agent_runs.tool_calls[].tool` guarda o nome da tool. Runs antigos ficariam com o nome velho.
  Duas saídas: uma migration que reescreve o jsonb, ou aceitar os dois nomes em `rotulos.ts` por um tempo.
  Como o app é de demonstração e o seed recria tudo, **sugiro a migration**, que é curta:
  um `jsonb_set` por tool em `tool_calls`.
- **Risco de comportamento:** o nome da tool é parte do prompt. Rodar `pnpm eval` completo e comparar com os 39/39 de
  antes. Nomes em inglês costumam funcionar bem no DeepSeek, mas é preciso medir.

## 6. Outros pontos fora da tabela

- **Logs**, ~10: `[chat] turno falhou` → `[chat] turn failed`, `[audit] falhou` → `[audit] failed`,
  `[bootstrap] migrations aplicadas; banco já tem dados…` → `[bootstrap] migrations applied; database has data, skipping seed`.
  Para achar: `git grep -nE "console\.(log|warn|error)"`.
- **Ids dos roteiros do modelo roteirizado** (`scripts.ts`): `so-eu` → `only-me`, `resolvidos` → `resolved`,
  `ver-codigo` → `ticket-by-code`, `rh` → `hr`, `duvida-horario` → `hours-question`, `incerto` → `uncertain`,
  `promessa` → `promise`, `decisao-invalida` → `invalid-decision`.
- **Ids dos cenários de eval** (`vendas-parado`, `reabrir-sap`…): aparecem no relatório e no `--only`.
  São identificadores, então em inglês (`sales-down`, `reopen-sap`), e o relatório mostra a `descricao` em português.
- **Texto da UI usado como chave:** `ChatView.tsx` compara `action === 'Adicionar informação'`. Trocar por um id
  (`'add_info'`) e deixar o rótulo só na tela. Vale procurar outros com `git grep -n "=== '[A-ZÁ-Ú]"`.
- **Chaves do seed** (`ana`, `carla`, `rafael`): são nomes de pessoas, ficam.
- **Campos do runner de evals** que vão para o relatório (`custo_cents`, `latencia_ms`, `falhas`): renomear no código;
  os cabeçalhos do Markdown gerado continuam em português.

## 7. Identificadores

Gerada a partir do código; "Onde" é o primeiro arquivo e quantos outros usam o mesmo nome. Nomes genéricos que se
repetem (`agora`, `texto`, `termo`) aparecem uma vez e valem para todos os arquivos.

<!-- gerado: 390 identificadores -->

#### `app`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `AtendimentoPage` | `SupportPage` | função | page.tsx |
| `sobre` | `about` | propriedade,variável | page.tsx |
| `FuncionarioLayout` | `EmployeeLayout` | função | layout.tsx |
| `PerfilPage` | `ProfilePage` | função | page.tsx |
| `vez` | `slot` | variável | route.ts (+1) |
| `conversaVisivel` | `getVisibleConversation` | função | route.ts |
| `agora` | `now` | parâmetro,propriedade,variável | route.ts (+18) |
| `ESPERA_DOS_CHAMADOS_MS` | `TICKET_SEARCH_WAIT_MS` | variável | route.ts |
| `FILTROS` | `FILTERS` | variável | route.ts (+1) |
| `chamadosQueCasam` | `findMatchingTickets` | função | route.ts |
| `espera` | `timeout` | variável | route.ts |
| `fechado` | `closed` | variável | route.ts |
| `ultimoPing` | `lastPing` | variável | route.ts |
| `ConsolePerfilPage` | `ConsoleProfilePage` | função | page.tsx |

#### `components/auth`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `emailErro` | `emailError` | variável | LoginForm.tsx |

#### `components/chat`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `OFERTA_VENCIDO` | `OVERDUE_OFFER` | variável | AgentMessage.tsx |
| `bolha` | `bubble` | variável | AgentMessage.tsx (+1) |
| `interativo` | `interactive` | variável | AgentMessage.tsx |
| `outros` | `others` | variável | AgentMessage.tsx (+2) |
| `vencido` | `overdue` | variável | AgentMessage.tsx |
| `FORA_DO_AR` | `TICKETS_DOWN_MESSAGE` | variável | ChatView.tsx (+1) |
| `comAnalista` | `isWithAnalyst` | função,variável | ChatView.tsx (+1) |
| `enviadas` | `sentCount` | variável | ChatView.tsx |
| `erro` | `error` | variável | ChatView.tsx (+3) |
| `semAgent` | `hasNoAgentContent` | variável | ChatView.tsx |
| `setErro` | `setError` | variável | ChatView.tsx (+1) |
| `temLive` | `hasLive` | variável | ChatView.tsx |
| `ultimoAgentId` | `lastAgentId` | variável | ChatView.tsx |
| `vivo` | `alive` | variável | ChatView.tsx (+2) |
| `enviar` | `send` | função,variável | Composer.tsx (+3) |
| `noLimite` | `atLimit` | variável | Composer.tsx |
| `prefillVisto` | `prefillSeen` | variável | Composer.tsx |
| `setPrefillVisto` | `setPrefillSeen` | variável | Composer.tsx |
| `toneDaConfianca` | `confidenceTone` | função | ConfidenceBar.tsx |
| `Secao` | `Section` | função | DecisionPanel.tsx |
| `acoes` | `actionsText` | variável | DecisionPanel.tsx (+1) |
| `atual` | `current` | parâmetro,propriedade,variável | DecisionPanel.tsx (+6) |
| `custo` | `cost` | função,variável | DecisionPanel.tsx (+1) |
| `partes` | `parts` | variável | DecisionPanel.tsx (+1) |
| `Campo` | `Field` | função | DraftCard.tsx (+1) |
| `Estado` | `DraftStatus` | função | DraftCard.tsx |
| `abrirEdicao` | `openEdit` | função | DraftCard.tsx |
| `confirmar` | `confirm` | função | DraftCard.tsx |
| `salvar` | `save` | função | DraftCard.tsx |
| `campoDeTexto` | `isTextField` | função | QuickReplies.tsx |
| `teclaLiberada` | `isShortcutAllowed` | função | QuickReplies.tsx |
| `nota` | `note` | variável | TicketCard.tsx |
| `quando` | `ago` | variável | TicketCard.tsx (+2) |

#### `components/console`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `acao` | `action` | variável | ConsoleConversation.tsx (+1) |
| `ativo` | `active` | propriedade,variável | ConsoleConversation.tsx (+1) |
| `busca` | `searchQuery` | variável | ConsoleConversation.tsx (+1) |
| `buscaAtual` | `searchIndex` | variável | ConsoleConversation.tsx |
| `fecharBusca` | `closeSearch` | variável | ConsoleConversation.tsx |
| `fecharToast` | `closeToast` | variável | ConsoleConversation.tsx |
| `fecharWhy` | `closeWhy` | variável | ConsoleConversation.tsx |
| `painel` | `panel` | variável | ConsoleConversation.tsx (+3) |
| `primeiro` | `firstName` | variável | ConsoleConversation.tsx (+3) |
| `resultados` | `results` | variável | ConsoleConversation.tsx |
| `setBusca` | `setSearchQuery` | variável | ConsoleConversation.tsx |
| `setBuscaAtual` | `setSearchIndex` | variável | ConsoleConversation.tsx |
| `setPainel` | `setPanel` | variável | ConsoleConversation.tsx |
| `setTicketsErro` | `setTicketsError` | variável | ConsoleConversation.tsx |
| `termo` | `term` | parâmetro,propriedade,variável | ConsoleConversation.tsx (+8) |
| `ticketsErro` | `ticketsError` | variável | ConsoleConversation.tsx |
| `ultimaPassagem` | `lastHandoff` | variável | ConsoleConversation.tsx |
| `ultimoClaim` | `lastClaim` | variável | ConsoleConversation.tsx |
| `SECOES` | `NON_CONVERSATION_SEGMENTS` | variável | ConsoleFrame.tsx |
| `emConversas` | `onConversations` | variável | ConsoleFrame.tsx |
| `lista` | `list` | variável | ConsoleFrame.tsx (+2) |
| `meu` | `requestSeq` | variável | ConsoleFrame.tsx (+1) |
| `segmento` | `segment` | variável | ConsoleFrame.tsx |
| `Corpo` | `MessageBody` | função | ConsoleThread.tsx |
| `Destaque` | `SearchHighlight` | tipo | ConsoleThread.tsx |
| `Sistema` | `SystemLine` | função | ConsoleThread.tsx |
| `anterior` | `previous` | variável | ConsoleThread.tsx |
| `colada` | `isGrouped` | variável | ConsoleThread.tsx |
| `destaque` | `highlight` | parâmetro,propriedade | ConsoleThread.tsx |
| `hoje` | `today` | variável | ConsoleThread.tsx |
| `ia` | `isAi` | variável | ConsoleThread.tsx |
| `MotivoIcon` | `MatchReasonIcon` | variável | ConversationList.tsx |
| `doAgent` | `fromAgent` | variável | ConversationList.tsx |
| `forte` | `emphasized` | variável | ConversationList.tsx |
| `motivo` | `matchReason` | variável | ConversationList.tsx (+1) |
| `Realce` | `Highlighted` | função | ConversationSearch.tsx |
| `antes` | `before` | parâmetro,variável | ConversationSearch.tsx (+11) |
| `ativa` | `activeIndex` | parâmetro,propriedade | ConversationSearch.tsx |
| `botao` | `buttonClass` | variável | ConversationSearch.tsx (+1) |
| `ir` | `move` | variável | ConversationSearch.tsx |
| `onAtual` | `onIndexChange` | parâmetro,propriedade | ConversationSearch.tsx |
| `onTermo` | `onTermChange` | parâmetro,propriedade | ConversationSearch.tsx |
| `passo` | `delta` | parâmetro | ConversationSearch.tsx |
| `texto` | `text` | parâmetro,propriedade,variável | ConversationSearch.tsx (+11) |
| `trechos` | `snippets` | variável | ConversationSearch.tsx (+1) |
| `aberto` | `openCode` | variável | EmployeeTickets.tsx (+1) |
| `foco` | `focusTicket` | variável | EmployeeTickets.tsx (+1) |
| `setAberto` | `setOpenCode` | variável | EmployeeTickets.tsx (+1) |
| `setTodos` | `setShowAll` | variável | EmployeeTickets.tsx |
| `todos` | `showAll` | parâmetro,variável | EmployeeTickets.tsx (+3) |
| `visiveis` | `visible` | variável | EmployeeTickets.tsx |
| `corpo` | `body` | variável | TakeoverBar.tsx (+4) |
| `titulo` | `title` | variável | TakeoverBar.tsx (+2) |
| `ENCERRADOS` | `CLOSED_STATUSES` | variável | TicketDetail.tsx |
| `buscar` | `fetchDetail` | variável | TicketDetail.tsx |
| `campo` | `field` | variável | TicketDetail.tsx |
| `rotulo` | `label` | parâmetro | TicketDetail.tsx |
| `tentarDeNovo` | `retry` | variável | TicketDetail.tsx |
| `valor` | `value` | parâmetro | TicketDetail.tsx |
| `fora` | `onOutsideClick` | variável | UserMenu.tsx (+2) |
| `raiz` | `rootRef` | variável | UserMenu.tsx |
| `sair` | `logout` | variável | UserMenu.tsx (+1) |
| `ORDEM` | `COLOR_ORDER` | variável | avatar.tsx |
| `PALETA` | `PALETTE` | variável | avatar.tsx |
| `corDe` | `colorFor` | função | avatar.tsx |
| `iniciaisDe` | `initialsOf` | função | avatar.tsx |
| `nome` | `name` | parâmetro,propriedade,variável | avatar.tsx (+3) |

#### `components/shell`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `Perfil` | `Profile` | tipo | ProfileDetails.tsx |
| `linha` | `rowClass` | variável | ProfileDetails.tsx |
| `aviso` | `notice` | variável | ResetPasswordButton.tsx |
| `setAviso` | `setNotice` | variável | ResetPasswordButton.tsx |

#### `e2e`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `detalhe` | `detail` | variável | console-controles.spec.ts (+1) |
| `selo` | `badge` | variável | console-controles.spec.ts |
| `AGORA_E2E` | `E2E_NOW` | variável | env.ts |
| `ultimaResposta` | `lastAgentReply` | variável | helpers.ts |
| `falta` | `remaining` | variável | instabilidade.spec.ts |
| `inicio` | `start` | variável | instabilidade.spec.ts (+2) |
| `abrir` | `openConversation` | função | transferencia.spec.ts |
| `linhasAntes` | `rowsBefore` | variável | transferencia.spec.ts |
| `primeira` | `first` | variável | transferencia.spec.ts |

#### `evals`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `CENARIOS` | `SCENARIOS` | variável | cenarios.ts |
| `Cenario` | `Scenario` | tipo | cenarios.ts |
| `acao_final` | `final_action` | propriedade | cenarios.ts |
| `alvo` | `target` | propriedade,variável | cenarios.ts (+3) |
| `categoria` | `category` | propriedade | cenarios.ts |
| `cita_artigo` | `cites_article` | propriedade | cenarios.ts |
| `descricao` | `description` | propriedade | cenarios.ts |
| `esperado` | `expected` | parâmetro,propriedade | cenarios.ts (+4) |
| `mostra_chamados` | `shows_tickets` | propriedade | cenarios.ts |
| `nao_mostra_chamados` | `hides_tickets` | propriedade | cenarios.ts |
| `prioridade` | `priority` | parâmetro,propriedade,variável | cenarios.ts (+3) |
| `rascunho` | `draft` | propriedade,variável | cenarios.ts (+1) |
| `texto_nao_contem` | `text_excludes` | propriedade | cenarios.ts |
| `tipo` | `type` | parâmetro,propriedade,variável | cenarios.ts (+2) |
| `tools_excluem` | `tools_exclude` | propriedade | cenarios.ts |
| `tools_incluem` | `tools_include` | propriedade | cenarios.ts |
| `turnos` | `turns` | propriedade,variável | cenarios.ts (+1) |
| `AGORA` | `NOW` | variável | run.ts |
| `LIMIAR` | `THRESHOLD` | variável | run.ts |
| `Resultado` | `Result` | tipo | run.ts |
| `VEZES` | `TIMES` | variável | run.ts |
| `aceitas` | `accepted` | variável | run.ts |
| `cenario` | `scenario` | propriedade | run.ts |
| `cenarios` | `scenarios` | variável | run.ts |
| `chamadas` | `calls` | variável | run.ts |
| `custo_cents` | `cost_cents` | propriedade | run.ts |
| `custos` | `costs` | variável | run.ts |
| `custosMedidos` | `measuredCosts` | variável | run.ts |
| `decisao` | `decision` | propriedade,variável | run.ts |
| `falhas` | `failures` | propriedade,variável | run.ts |
| `fmtCusto` | `formatCost` | variável | run.ts |
| `fontes` | `sources` | variável | run.ts |
| `latencia` | `latency` | variável | run.ts |
| `latencia_ms` | `latency_ms` | propriedade | run.ts |
| `linhas` | `lines` | variável | run.ts |
| `modelo` | `model` | variável | run.ts |
| `mostrados` | `shown` | variável | run.ts |
| `normalizar` | `normalize` | função,variável | run.ts (+2) |
| `novo` | `sinceStart` | variável | run.ts (+1) |
| `passou` | `passed` | variável | run.ts (+1) |
| `porCenario` | `byScenario` | variável | run.ts |
| `proibido` | `forbidden` | variável | run.ts |
| `resposta` | `answer` | propriedade,variável | run.ts |
| `rodar` | `runScenario` | função | run.ts |
| `taxa` | `passRate` | variável | run.ts |
| `textos` | `texts` | variável | run.ts (+1) |
| `transferencias` | `transfers` | variável | run.ts |
| `ultimo` | `last` | variável | run.ts (+1) |
| `writerColetor` | `collectingWriter` | função | run.ts |

#### `lib/agent-engine/agent`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `FORMATO` | `DECISION_FORMAT` | variável | decisao.ts |
| `declararDecisao` | `declareDecision` | função | decisao.ts |
| `INDISPONIVEL` | `UNAVAILABLE_LABEL` | variável | rotulos.ts |
| `rotulosPara` | `labelsFor` | função | rotulos.ts |
| `ACAO_DO_RASCUNHO` | `DRAFT_ACTION` | variável | run-turn.ts |
| `AVISO_NAO_CRIADO` | `NOT_CREATED_NOTICE` | variável | run-turn.ts |
| `AVISO_ORCAMENTO` | `BUDGET_NOTICE` | variável | run-turn.ts |
| `GUARD_CRIACAO` | `CREATION_GUARD` | variável | run-turn.ts |
| `GUARD_PROMESSA` | `PROMISE_GUARD` | variável | run-turn.ts |
| `ajustada` | `adjusted` | variável | run-turn.ts |
| `anteriores` | `previous` | variável | run-turn.ts |
| `chamadoEmFoco` | `getFocusTicket` | função | run-turn.ts |
| `declarada` | `declared` | parâmetro,variável | run-turn.ts (+1) |
| `fontesJaVerificadas` | `previouslyVerifiedSources` | função | run-turn.ts |
| `gastoDoDia` | `dailySpend` | função | run-turn.ts |
| `teto` | `cap` | variável | run-turn.ts |
| `texto_funcionario` | `employee_text` | propriedade | run-turn.ts (+2) |
| `turnoDeRegra` | `ruleBasedTurn` | função | run-turn.ts |

#### `lib/agent-engine/conhecimento`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `RELEVANCIA_MINIMA` | `MIN_RELEVANCE` | variável | busca.ts |
| `artigos` | `articles` | parâmetro,variável | busca.ts (+1) |
| `buscarArtigos` | `searchArticles` | função | busca.ts |
| `consulta` | `query` | parâmetro | busca.ts |
| `limite` | `limit` | parâmetro | busca.ts |
| `tokenizar` | `tokenize` | função | busca.ts |

#### `lib/agent-engine/edge`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `custoEmCentavos` | `costInCents` | função | cost.ts |
| `precos` | `prices` | parâmetro | cost.ts |
| `precoAtual` | `currentPrice` | função | record.ts |
| `caiu` | `isDown` | variável | scripts.ts |
| `prazo` | `deadline` | variável | scripts.ts (+1) |
| `prazoCurto` | `shortDeadline` | variável | scripts.ts |

#### `lib/agent-engine/gatilhos`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `EntradaGatilhos` | `TriggerInput` | tipo | transferencia.ts |
| `HUMANO` | `HUMAN_PATTERN` | variável | transferencia.ts |
| `NIVEL_POR_MOTIVO` | `LEVEL_BY_REASON` | variável | transferencia.ts |
| `OUTRO_SETOR` | `OTHER_DEPARTMENT` | variável | transferencia.ts |
| `PEDIDOS` | `REQUEST_PATTERNS` | variável | transferencia.ts |
| `ResultadoGatilhos` | `TriggerResult` | tipo | transferencia.ts |
| `SUPORTE` | `SUPPORT_PATTERN` | variável | transferencia.ts |
| `avaliarGatilhos` | `evaluateTriggers` | função | transferencia.ts |
| `pediuAnalista` | `askedForAnalyst` | função | transferencia.ts |
| `regra` | `rule` | propriedade,variável | transferencia.ts (+5) |

#### `lib/agent-engine/guardrails`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `AFIRMACOES` | `CREATION_CLAIMS` | variável | acao-alucinada.ts |
| `afirmouCriacao` | `claimsCreation` | função | acao-alucinada.ts |
| `ajustarConfianca` | `adjustConfidence` | função | confianca.ts |
| `sinais` | `signals` | parâmetro | confianca.ts |
| `CONDICIONAL` | `CONDITIONAL_PATTERN` | variável | promessa-analista.ts |
| `PROMESSAS` | `PROMISE_PATTERNS` | variável | promessa-analista.ts |
| `frases` | `sentences` | variável | promessa-analista.ts |
| `prometeuAnalista` | `promisedAnalyst` | função | promessa-analista.ts |

#### `lib/agent-engine/tools`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `buscarArtigosTool` | `searchArticlesTool` | variável | buscar-artigos.ts |
| `atraso` | `delay` | variável | buscar-meus-chamados.ts (+2) |
| `buscarMeusChamados` | `listMyTicketsTool` | variável | buscar-meus-chamados.ts |
| `buscar_artigos` | `search_articles` | propriedade | index.ts (+1) |
| `buscar_meus_chamados` | `list_my_tickets` | propriedade | index.ts (+1) |
| `finais` | `final` | variável | index.ts (+1) |
| `montar_rascunho` | `build_draft` | propriedade | index.ts (+1) |
| `oferecer_opcoes` | `offer_options` | propriedade | index.ts (+1) |
| `transferir_para_analista` | `transfer_to_analyst` | propriedade | index.ts |
| `ver_chamado` | `get_ticket` | propriedade | index.ts (+1) |
| `montarRascunho` | `buildDraftTool` | variável | montar-rascunho.ts |
| `oferecerOpcoes` | `offerOptionsTool` | variável | oferecer-opcoes.ts |
| `transferirParaAnalista` | `transferToAnalystTool` | variável | transferir.ts |
| `verChamado` | `getTicketTool` | variável | ver-chamado.ts |

#### `lib/api`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `desde` | `since` | parâmetro,variável | rate-limit.ts (+2) |
| `limpar` | `prune` | variável | rate-limit.ts |
| `ultimaLimpeza` | `lastPrune` | variável | rate-limit.ts |

#### `lib/client`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `useSair` | `useLogout` | função | use-sair.ts |

#### `lib/conversations`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `TITULO` | `TITLE_BY_REASON` | variável | handoff.ts |
| `ORDEM_DO_MOTIVO` | `MATCH_KIND_ORDER` | variável | queries.ts |
| `ate` | `to` | variável | queries.ts |
| `casaFoco` | `matchesFocus` | variável | queries.ts |
| `casaMensagem` | `matchesMessage` | variável | queries.ts |
| `casaNome` | `matchesName` | variável | queries.ts |
| `de` | `from` | variável | queries.ts (+1) |
| `depois` | `after` | parâmetro | queries.ts |
| `donos` | `ticketOwners` | variável | queries.ts |
| `filtro` | `filterCondition` | função | queries.ts |
| `inteira` | `wholeWord` | propriedade | queries.ts (+2) |
| `limpo` | `cleaned` | variável | queries.ts (+1) |
| `mensagem` | `matched_message` | propriedade | queries.ts |
| `minutosAte` | `minutesUntil` | função | queries.ts |
| `pNome` | `namePattern` | variável | queries.ts |
| `pTexto` | `textPattern` | variável | queries.ts |
| `por_foco` | `by_focus` | propriedade | queries.ts |
| `por_nome` | `by_name` | propriedade | queries.ts |
| `trechoEmVolta` | `snippetAround` | função | queries.ts |
| `falas` | `utterances` | variável | release-note.ts |
| `resumo` | `summary` | variável | release-note.ts |
| `ultimas` | `recent` | variável | release-note.ts |
| `EVENTO` | `EVENT_BY_TRANSITION` | variável | service.ts |
| `TEXTO` | `TEXT_BY_TRANSITION` | variável | service.ts |
| `comNomeDeQuemAssumiu` | `withClaimerName` | função | service.ts |
| `conflitoPara` | `conflictFor` | função | service.ts |
| `hora` | `time` | função,parâmetro | service.ts (+2) |
| `lido` | `read` | variável | service.ts |
| `nomeDe` | `nameOf` | função | service.ts |
| `nova` | `next` | variável | service.ts |
| `relido` | `reread` | variável | service.ts |
| `visivel` | `isVisible` | variável | service.ts |

#### `lib/db`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `DE` | `ACCENTED` | variável | busca.ts |
| `ESPECIAIS` | `REGEX_SPECIAL` | variável | busca.ts |
| `PALAVRA` | `WORD_CHAR` | variável | busca.ts |
| `PARA` | `UNACCENTED` | variável | busca.ts |
| `fim` | `end` | variável | busca.ts (+3) |
| `padraoDeBusca` | `searchPattern` | função | busca.ts |
| `semAcento` | `unaccented` | função | busca.ts |
| `termoCurto` | `isShortTerm` | função | busca.ts |
| `conversasDoSeed` | `seedConversations` | função | seed.ts |
| `previewDe` | `previewOf` | função | seed.ts |

#### `lib/drafts`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `VERBO` | `VERB_BY_KIND` | variável | service.ts |
| `venceu` | `won` | variável | service.ts |

#### `lib/format.ts`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `FUSO` | `TIMEZONE` | variável | format.ts (+1) |
| `MESES` | `MONTHS` | variável | format.ts |
| `dataCurta` | `shortDate` | função | format.ts |
| `dataHora` | `dateTime` | função | format.ts |
| `dias` | `days` | variável | format.ts (+1) |
| `dois` | `pad2` | variável | format.ts (+1) |
| `haQuanto` | `daysAgo` | função | format.ts |
| `mesmoDia` | `sameDay` | variável | format.ts |
| `ontem` | `yesterday` | variável | format.ts (+1) |
| `quandoCurto` | `shortWhen` | função | format.ts |

#### `lib/regras`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `TABELA` | `TRANSITIONS` | variável | conversa-estado.ts |
| `estado` | `state` | parâmetro | conversa-estado.ts (+1) |
| `evento` | `event` | parâmetro | conversa-estado.ts (+1) |
| `transicao` | `transition` | função | conversa-estado.ts |
| `ABERTURA` | `OPENING_HOUR` | variável | horario-util.ts |
| `FECHAMENTO` | `CLOSING_HOUR` | variável | horario-util.ts |
| `HORAS_POR_DIA_UTIL` | `BUSINESS_HOURS_PER_DAY` | variável | horario-util.ts |
| `abertura` | `opening` | variável | horario-util.ts |
| `dia` | `day` | variável | horario-util.ts |
| `disponivel` | `available` | variável | horario-util.ts |
| `emSp` | `inSaoPaulo` | função | horario-util.ts |
| `noHorario` | `isWithinBusinessHours` | função | horario-util.ts |
| `proximoDia` | `nextBusinessDay` | função | horario-util.ts |
| `restante` | `remaining` | variável | horario-util.ts (+1) |
| `DIAS` | `DAYS` | variável | prazo.ts |
| `EXPEDIENTE` | `BUSINESS_HOURS` | variável | prazo.ts |
| `calcularPrazo` | `computeDeadline` | função | prazo.ts |
| `formatarPrazoCurto` | `formatShortDeadline` | função | prazo.ts |
| `horaSp` | `timeInSaoPaulo` | função | prazo.ts |
| `mesmoDiaSp` | `isSameDayInSaoPaulo` | função | prazo.ts |
| `EntradaPrioridade` | `PriorityInput` | tipo | prioridade.ts |
| `calcularPrioridade` | `computePriority` | função | prioridade.ts |
| `JANELA_REABERTURA_MS` | `REOPEN_WINDOW_MS` | variável | reabertura.ts |
| `podeReabrir` | `canReopen` | função | reabertura.ts |
| `DIA` | `DAY` | variável | vencido.ts (+1) |
| `STATUS_COM_PRAZO` | `STATUSES_WITH_DEADLINE` | variável | vencido.ts |
| `descreverAtraso` | `describeOverdue` | função | vencido.ts |
| `diasSemAtualizacao` | `daysSinceUpdate` | função | vencido.ts |
| `estaVencido` | `isOverdue` | função | vencido.ts |

#### `lib/server`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `iniciais` | `initials` | função | session.ts |

#### `lib/text`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `MARCAS` | `COMBINING_MARKS` | variável | trechos.ts |
| `achados` | `matches` | variável | trechos.ts |
| `acharTrechos` | `findMatches` | função | trechos.ts |
| `contem` | `containsTerm` | função | trechos.ts |
| `dobrado` | `folded` | variável | trechos.ts |
| `dobrar` | `fold` | função | trechos.ts |
| `fimDobrado` | `foldedEnd` | variável | trechos.ts |
| `origem` | `sourceIndex` | variável | trechos.ts |

#### `services/tickets`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `recibo` | `receipt` | variável | idempotency.ts |
| `ABERTOS` | `OPEN_STATUSES` | variável | repo.ts |
| `codigo` | `codePattern` | variável | repo.ts |

#### `tests`

| Hoje | Proposta | Tipo | Onde |
|---|---|---|---|
| `AGORA_TESTE` | `TEST_NOW` | variável | db.ts |
| `abertos` | `OPEN_STATUSES` | variável | fake-tickets.ts |
| `recibos` | `receipts` | variável | fake-tickets.ts |
| `registrar` | `recordEvent` | variável | fake-tickets.ts |
| `statusDe` | `statusOf` | variável | run-turn.test.ts |
| `turno` | `runTurnFor` | função | run-turn.test.ts |
| `fila` | `queue` | variável | budget.test.ts (+1) |
| `gastoDeHoje` | `todaySpend` | função | budget.test.ts |
| `tentar` | `attempt` | variável | budget.test.ts |
| `anaTransferida` | `transferAnaConversation` | função | console.test.ts |
| `outro` | `other` | variável | console.test.ts |
| `draftDa` | `draftFor` | função | drafts.test.ts |
| `daAna` | `anaEvents` | variável | events.test.ts |
| `daCarla` | `carlaEvents` | variável | events.test.ts |
| `desdeOInicio` | `fromStart` | variável | events.test.ts |
| `leitura` | `reading` | variável | events.test.ts |
| `ouvir` | `listen` | função | events.test.ts |
| `segundo` | `second` | variável | events.test.ts |
| `transferirEAssumir` | `transferAndClaim` | função | events.test.ts |
| `anaFalouDeVpn` | `anaTalkedAboutVpn` | função | service.test.ts |
| `devolvida` | `returned` | variável | service.test.ts |
| `erroDe` | `errorOf` | função | service.test.ts |
| `eventos` | `events` | função,variável | service.test.ts (+1) |
| `fechada` | `closed` | variável | service.test.ts |
| `minhas` | `mine` | variável | service.test.ts |
| `nomes` | `names` | variável | service.test.ts |
| `pagina` | `page` | variável | service.test.ts |
| `paraVoce` | `forYou` | variável | service.test.ts |
| `porCodigo` | `byCode` | variável | service.test.ts |
| `porTitulo` | `byTitle` | variável | service.test.ts |
| `todas` | `all` | variável | service.test.ts (+1) |
| `vencedor` | `winner` | variável | service.test.ts |
| `vistas` | `seen` | variável | service.test.ts |
| `por` | `byKey` | variável | seed.test.ts |
| `inexistente` | `missing` | variável | service.test.ts |
| `nao` | `rejected` | variável | service.test.ts |
| `chaves` | `keys` | variável | tools.test.ts |
| `interno` | `internalCheck` | variável | tools.test.ts |
| `barrada` | `blocked` | variável | rate-limit.test.ts |
| `forjado` | `forged` | variável | session.test.ts |
| `setAtual` | `setCurrent` | variável | ConversationSearch.dom.test.tsx |
| `setTermo` | `setTerm` | variável | ConversationSearch.dom.test.tsx |
| `renderPainel` | `renderPanel` | função | EmployeeTickets.dom.test.tsx |
| `nunca` | `neverResolves` | variável | tickets-client.test.ts |
| `respostas` | `answers` | parâmetro | tickets-client.test.ts |
| `_ignorado` | `_ignored` | variável | env.test.ts |
| `semModelo` | `withoutModel` | variável | env.test.ts |
| `regras` | `rules` | variável | next-config.test.ts |
| `Esperado` | `Expected` | tipo | conversa-estado.test.ts |
| `matriz` | `matrix` | variável | conversa-estado.test.ts |
| `_rotulo` | `_label` | parâmetro | prazo.test.ts |
| `casos` | `cases` | variável | prazo.test.ts (+1) |

## 8. Como executar

**Ferramenta:** um script com [ts-morph](https://ts-morph.com) que lê `docs/mapeamento-ingles.json` e chama
`rename()` em cada declaração. A renomeação é semântica: segue as referências, os imports e as propriedades de objeto
pelo type checker, e não pega por engano a palavra dentro de um texto da UI. Arquivos e pastas com `git mv` e
`sourceFile.move()`, que também corrige os imports. Um `sed` às cegas não serve: "prazo" aparece em centenas de
textos de tela que precisam continuar em português.

**Fases**, um commit cada, com `pnpm check && pnpm test:int && pnpm test:e2e` verdes entre elas:

1. `lib/regras` → `lib/rules` (funções puras, bem testadas; o melhor lugar para validar o script).
2. `lib/text`, `lib/db/busca.ts`, `lib/format.ts`, `lib/conversations`, `lib/api`, `lib/client`, `services/tickets`.
3. `lib/agent-engine` sem as tools: `gatilhos`, `guardrails`, `conhecimento`, `agent/`.
4. Tools: nomes de arquivo, de variável e **nomes que o modelo vê**, com a migration do jsonb. Rodar `pnpm eval` completo.
5. `components/` e `app/` (componentes, hooks, estado local).
6. `evals/`, `tests/`, `e2e/` (nomes de arquivo, helpers, variáveis).
7. Se decidido na seção 3: comentários e nomes de teste.

**Depois de cada fase:** procurar resto com
`git grep -nwiE "chamado|rascunho|prazo|funcionario|conversa|busca|texto|agora" -- '*.ts' '*.tsx'` e conferir que
cada ocorrência que sobrou está dentro de uma string de UI, do prompt ou de um comentário.

**Riscos:**
- Propriedades de objeto que são contrato com o banco ou com a API (ex.: `mensagem`, `por_nome` em
  `lib/conversations/queries.ts` são aliases de select do Drizzle; renomear muda o SQL gerado, mas não o banco).
  Os testes de integração cobrem.
- Strings usadas como chave (seção 6) não são pegas pelo ts-morph.
- A fase 4 pode mudar o comportamento do modelo; é a única que precisa de eval.
