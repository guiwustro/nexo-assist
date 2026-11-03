import { describe, expect, it } from 'vitest';
import { calcularPrioridade } from '@/lib/regras/prioridade';
import { PRIORITY_LABEL, type Affected, type Priority, type TicketType } from '@/lib/contracts/enums';

const casos: Array<[TicketType, Affected, boolean, boolean, Priority]> = [
  ['incident', 'team', true, false, 'critical'],
  ['incident', 'company', true, false, 'critical'],
  ['incident', 'team', false, false, 'medium'],
  ['incident', 'me', true, false, 'high'],
  ['request', 'me', false, true, 'high'],
  ['request', 'me', false, false, 'low'],
  ['incident', 'me', false, false, 'medium'],
];

describe('calcularPrioridade', () => {
  it.each(casos)('%s / %s / bloqueia=%s / hoje=%s → %s', (type, affected, blocks_work, deadline_today, esperado) => {
    const r = calcularPrioridade({ type, affected, blocks_work, deadline_today });
    expect(r.priority).toBe(esperado);
    expect(r.regra.startsWith(PRIORITY_LABEL[esperado])).toBe(true);
  });

  it('a regra da Crítica cita o prazo de 1 hora', () => {
    const r = calcularPrioridade({ type: 'incident', affected: 'company', blocks_work: true, deadline_today: true });
    expect(r.regra).toBe('Crítica: algo parado para uma equipe ou para a empresa · prazo 1 hora');
  });
});
