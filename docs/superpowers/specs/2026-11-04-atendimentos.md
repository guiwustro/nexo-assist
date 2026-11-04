# Atendimentos separados — especificação

Decidido com o Gui em 04/11/2026. Substitui "uma conversa por funcionário, para sempre".

## Problema

Hoje cada funcionário tem uma única conversa (`conversations_employee_unique`). Encerrar e mandar outra mensagem
reabre a mesma conversa. Consequências:

- No console, o problema de hoje aparece misturado com os de semanas atrás; o analista não sabe onde um assunto
  começa e termina.
- Com a conversa transferida, o funcionário não consegue tirar outra dúvida com o agent até o analista devolver.

## Modelo

- **Conversa = atendimento.** Tem começo e fim. Um atendimento pode gerar 0, 1 ou vários chamados; um chamado pode
  passar por vários atendimentos (criado num, atualizado noutro). Não existe "chat por chamado": a conversa nasce
  antes do chamado (dúvida, duplicidade, consulta sem número, fora de escopo, transferência por baixa confiança).
- **No máximo um atendimento com o agent** (`ai_handling`) por funcionário. Com analista (`pending`, `claimed`),
  quantos houver. Garantido por índice único parcial no banco.
- `closed` é terminal: mensagem nova nunca reabre um atendimento encerrado.

## Ciclo de vida (automático)

| Quando | O que acontece |
|---|---|
| Funcionário abre `/atendimento` | Mostra o atendimento aberto mais recente (com agent ou com analista). Se não houver aberto, o encerrado mais recente (leitura). Funcionário sem nenhum: cria um vazio com o agent |
| Mensagem num atendimento encerrado | O servidor abre (ou reusa) o atendimento com o agent e roda o turno nele |
| Conversa transferida | Continua sendo um fio com o analista. O chat oferece "Falar de outro assunto", que abre (ou reabre o existente) atendimento com o agent |
| "Falar sobre este chamado" (`?sobre=INC-…`) | Se o chamado é o foco de um atendimento com analista, abre aquele fio; senão, o atendimento com o agent com o composer preenchido |
| Agent num atendimento novo | Recebe na memória uma nota com os últimos atendimentos (data, como terminou, chamados) |
| Mensagem sobre um chamado que está com analista noutro atendimento | `build_draft` recusa (`ticket_with_analyst`) e `get_ticket` informa; o agent indica o fio do analista |

## Como termina

| Motivo (`closed_reason`) | Gatilho | Rótulo |
|---|---|---|
| `analyst` | Analista clica em Encerrar | Encerrada |
| `resolved` | Funcionário confirma que resolveu; o agent chama a tool `mark_resolved` | Resolvida pelo agent |
| `merged` | Analista devolve ao agent, mas o funcionário já tem outro atendimento com o agent | Encerrada · juntada |

Nenhum atendimento fecha por tempo. Quem volta dias depois continua de onde parou (história 6 do PRD).

**Devolver com outro atendimento ativo:** o devolvido fecha como `merged`; a nota do analista (já gravada hoje ao
devolver) vai para a memória do atendimento ativo, e uma mensagem de sistema aparece nele.

## Sessão de 30 mensagens

Continua por sessão de login, somando todos os atendimentos (o limite existe pelo custo do modelo). O contador sai
da conversa e vai para `employee_sessions` (um por funcionário). Regras de hoje mantidas: login mais novo zera;
mensagem para analista sempre passa.

## Telas

- **Funcionário:** seletor "Atendimentos" no topo do chat (abertos primeiro, depois encerrados com data e
  motivo); rota `/atendimento/[id]`; atendimento encerrado mostra o aviso "Este atendimento foi encerrado" e a
  próxima mensagem começa outro; banner de analista ganha "Falar de outro assunto". O detalhe em Meus chamados
  lista "Atendimentos sobre este chamado".
- **Console:** um item por atendimento (atendimento vazio não aparece). "Desta conversa" lista os chamados do
  atendimento (foco + rascunhos confirmados). O detalhe do chamado lista "Atendimentos sobre este chamado" com
  link. "Devolver ao agent" avisa quando vai juntar.

## Entender um chamado (usabilidade)

Três níveis, para o funcionário e para o analista:

1. **Rápido:** título, descrição (a que o funcionário conferiu no rascunho), status e prazo — já existe.
2. **O que aconteceu:** histórico do sistema de chamados — já existe; o seed passa a ter histórico realista
   (comentário do analista, mudança de status), para a demo não parecer vazia.
3. **Tudo:** "Atendimentos sobre este chamado", cada um com **"Ver na conversa"**, que abre o atendimento rolado
   até o card do rascunho que criou, atualizou ou reabriu o chamado, com destaque (carrega páginas anteriores se
   precisar). Chamado sem atendimento mostra **"Aberto fora do Nexo Assist"**.

## Fora do escopo

Vários atendimentos com o agent ao mesmo tempo; reabrir atendimento encerrado; encerrar por inatividade (quebraria
a história 6).
