import type { Affected, Priority, TicketType } from '@/lib/contracts/enums';

export type EntradaPrioridade = {
  type: TicketType;
  affected: Affected;
  blocks_work: boolean;
  deadline_today: boolean;
};

/** Anexo A: prioridade = impacto × urgência. A primeira regra que casar vence. */
export function calcularPrioridade(i: EntradaPrioridade): { priority: Priority; regra: string } {
  if ((i.affected === 'team' || i.affected === 'company') && i.blocks_work) {
    return {
      priority: 'critical',
      regra: 'Crítica: algo parado para uma equipe ou para a empresa · prazo 1 hora',
    };
  }
  if (i.blocks_work || i.deadline_today) {
    return {
      priority: 'high',
      regra: 'Alta: impede uma pessoa de trabalhar ou há compromisso no mesmo dia · prazo 4 horas úteis',
    };
  }
  if (i.type === 'request') {
    return { priority: 'low', regra: 'Baixa: pedido sem urgência · prazo 5 dias úteis' };
  }
  return { priority: 'medium', regra: 'Média: atrapalha, mas há alternativa · prazo 3 dias úteis' };
}
