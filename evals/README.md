# Evals

Os testes unitários, de integração e E2E rodam com um modelo roteirizado: eles provam o pipeline
(tools, regras, guardrails, persistência), não o julgamento do modelo. Os evals medem isso, com o modelo real.

## O que roda

`scenarios.ts` traz 15 cenários tirados das histórias do PRD: dúvida resolvida pela central, encerramento
depois da confirmação do funcionário, VPN 809 no
Windows 10 e no 11, consulta de status, chamado vencido, complemento, duplicado, reabertura dentro e fora da
janela de 7 dias, caso crítico, assunto fora de TI, prompt injection e requisição de equipamento.

`run.ts` roda cada cenário 3× contra o pipeline real (`runTurn`: memória, tools, decisão declarada, gatilhos e
guardrails), com o banco `nexo_test` (seed refeito a cada repetição) e o serviço de chamados falso em memória.
Depois do último turno ele confere o que **ficou registrado**: tools chamadas (`ai_agent_runs.tool_calls`), ação
da decisão, transferências, o rascunho montado (tipo, alvo, prioridade, categoria), fontes citadas e o texto
enviado. Não há juiz LLM: todo critério é verificável no banco.

## Como rodar

```bash
docker compose up -d db
# no .env: LLM_PROVIDER=deepseek, DEEPSEEK_API_KEY=..., e para medir custo:
# LLM_PRICE_IN_CENTS_PER_MTOK=... LLM_PRICE_OUT_CENTS_PER_MTOK=...
pnpm eval                      # 15 cenários × 3, grava evals/resultados.md
pnpm eval --only reopen-sap   # um cenário (ids separados por vírgula)
pnpm eval --vezes 1            # menos repetições
pnpm eval --scripted           # com o modelo roteirizado: confere o runner sem gastar nada
```

Sai com código 1 se a taxa geral ficar abaixo de 80%. Cenários abaixo de 80% aparecem com ⚠ na tabela.

## Regras

- Ajustes vão em `lib/agent-engine/agent/instructions.ts` e nas `description` das tools, um commit por ajuste,
  com o antes/depois na mensagem.
- O eval nunca é ajustado para passar. Se um critério estiver errado, a correção é discutida no commit.
- Resultado mais recente: [`resultados.md`](./resultados.md).
