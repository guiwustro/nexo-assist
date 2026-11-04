const INDISPONIVEL = 'sistema de chamados indisponível';

type Obj = Record<string, unknown> | null | undefined;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** Rótulos da status line (textos do protótipo). Saem das tool calls reais, nunca do texto do modelo. */
export function rotulosPara(tool: string, input: unknown, output: unknown): string[] {
  const out = asObj(output);
  if (out?.error === 'tickets_unavailable') return [INDISPONIVEL];
  const inp = asObj(input);
  switch (tool) {
    case 'buscar_meus_chamados':
      return ['consultou seus chamados'];
    case 'ver_chamado': {
      const code = String((asObj(out?.ticket)?.code as string | undefined) ?? inp?.code ?? 'chamado');
      return out?.found === false ? [`consultou o ${code}`] : [`consultou o ${code}`, 'calculou o prazo'];
    }
    case 'buscar_artigos':
      return ['buscou na central de ajuda'];
    case 'montar_rascunho':
      // Recusado por duplicidade: só os chamados foram consultados, nenhum rascunho saiu.
      if (out?.error === 'possible_duplicate') return ['consultou seus chamados'];
      return ['classificou a prioridade', 'consultou o SLA', 'montou o rascunho'];
    case 'transferir_para_analista':
      return ['transferiu para um analista'];
    case 'oferecer_opcoes':
      return [];
    default:
      return [tool.replace(/_/g, ' ')];
  }
}
