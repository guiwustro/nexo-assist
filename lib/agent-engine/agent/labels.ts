const UNAVAILABLE_LABEL = 'sistema de chamados indisponível';

type Obj = Record<string, unknown> | null | undefined;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** Rótulos da status line (textos do protótipo). Saem das tool calls reais, nunca do texto do modelo. */
export function labelsFor(tool: string, input: unknown, output: unknown): string[] {
  const out = asObj(output);
  if (out?.error === 'tickets_unavailable') return [UNAVAILABLE_LABEL];
  const inp = asObj(input);
  switch (tool) {
    case 'list_my_tickets':
      return ['consultou seus chamados'];
    case 'get_ticket': {
      const code = String((asObj(out?.ticket)?.code as string | undefined) ?? inp?.code ?? 'chamado');
      return out?.found === false ? [`consultou o ${code}`] : [`consultou o ${code}`, 'calculou o prazo'];
    }
    case 'search_articles':
      return ['buscou na central de ajuda'];
    case 'build_draft':
      // Recusado por duplicidade: só os chamados foram consultados, nenhum rascunho saiu.
      if (out?.error === 'possible_duplicate') return ['consultou seus chamados'];
      return ['classificou a prioridade', 'consultou o SLA', 'montou o rascunho'];
    case 'transfer_to_analyst':
      return ['transferiu para um analista'];
    case 'offer_options':
      return [];
    default:
      return [tool.replace(/_/g, ' ')];
  }
}
