import type { Affected, Priority, TicketType } from '@/lib/contracts/enums';

export type PriorityInput = {
  type: TicketType;
  affected: Affected;
  blocks_work: boolean;
  deadline_today: boolean;
};

/** Anexo A: prioridade = impacto × urgência. A primeira regra que casar vence. */
export function computePriority(i: PriorityInput): { priority: Priority; rule: string } {
  if ((i.affected === 'team' || i.affected === 'company') && i.blocks_work) {
    return {
      priority: 'critical',
      rule: 'Crítica: algo parado para uma equipe ou para a empresa · prazo 1 hora',
    };
  }
  if (i.blocks_work || i.deadline_today) {
    return {
      priority: 'high',
      rule: 'Alta: impede uma pessoa de trabalhar ou há compromisso no mesmo dia · prazo 4 horas úteis',
    };
  }
  if (i.type === 'request') {
    return { priority: 'low', rule: 'Baixa: pedido sem urgência · prazo 5 dias úteis' };
  }
  return { priority: 'medium', rule: 'Média: atrapalha, mas há alternativa · prazo 3 dias úteis' };
}
