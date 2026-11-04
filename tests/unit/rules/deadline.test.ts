import { afterAll, describe, expect, it } from 'vitest';
import { TZDate } from '@date-fns/tz';
import { addBusinessDays, addBusinessHours } from '@/lib/rules/business-hours';
import { computeDeadline, formatShortDeadline } from '@/lib/rules/deadline';
import type { Priority } from '@/lib/contracts/enums';

const SP = 'America/Sao_Paulo';
/** Data em horário de São Paulo: (dia de novembro/2026, hora, minuto). 03/11/2026 é terça. */
const sp = (day: number, h: number, m = 0) => new Date(new TZDate(2026, 10, day, h, m, SP).getTime());

const casos: Array<[string, Date, Priority, Date]> = [
  ['ter 10:00', sp(3, 10), 'high', sp(3, 14)],
  ['ter 16:00', sp(3, 16), 'high', sp(4, 10)],
  ['sex 17:00', sp(6, 17), 'high', sp(9, 11)],
  ['sáb 10:00', sp(7, 10), 'high', sp(9, 12)],
  ['seg 07:00', sp(9, 7), 'high', sp(9, 12)],
  ['ter 10:00', sp(3, 10), 'medium', sp(6, 10)],
  ['qui 15:00', sp(5, 15), 'medium', sp(10, 15)],
  ['ter 10:00', sp(3, 10), 'low', sp(10, 10)],
  ['sáb 22:00', sp(7, 22), 'critical', sp(7, 23)],
  ['sex 17:30', sp(6, 17, 30), 'critical', sp(6, 18, 30)],
];

const tzOriginal = process.env.TZ;
afterAll(() => {
  process.env.TZ = tzOriginal;
});

describe.each(['UTC', 'Asia/Tokyo', 'America/Sao_Paulo'])('com o servidor em %s', (tz) => {
  it.each(casos)('%s + %s → prazo esperado', (_rotulo, desde, prioridade, esperado) => {
    process.env.TZ = tz;
    expect(computeDeadline(prioridade, desde).due_at.toISOString()).toBe(esperado.toISOString());
  });

  it('formatarPrazoCurto no mesmo dia mostra só a hora', () => {
    process.env.TZ = tz;
    expect(formatShortDeadline(sp(3, 13, 43), sp(3, 9, 43))).toBe('resposta até 13:43');
  });

  it('formatarPrazoCurto em outro dia mostra o dia da semana', () => {
    process.env.TZ = tz;
    expect(formatShortDeadline(sp(4, 10), sp(3, 16))).toBe('resposta até qua 10:00');
  });
});

describe('horário útil', () => {
  it('terminar exatamente às 18:00 não pula para o dia seguinte', () => {
    expect(addBusinessHours(sp(3, 14), 4).toISOString()).toBe(sp(3, 18).toISOString());
  });
  it('começar às 18:00 conta a partir da próxima abertura', () => {
    expect(addBusinessHours(sp(3, 18), 1).toISOString()).toBe(sp(4, 9).toISOString());
  });
  it('um dia útil equivale a 10 horas úteis', () => {
    expect(addBusinessDays(sp(3, 10), 1).toISOString()).toBe(sp(4, 10).toISOString());
  });
  it('a regra descreve o prazo do Anexo A', () => {
    expect(computeDeadline('high', sp(3, 10)).rule).toBe('Alta: 4 horas úteis (seg–sex, 8h–18h)');
    expect(computeDeadline('critical', sp(3, 10)).rule).toBe('Crítica: 1 hora corrida (plantão 24h)');
    expect(computeDeadline('medium', sp(3, 10)).rule).toBe('Média: 3 dias úteis (seg–sex, 8h–18h)');
    expect(computeDeadline('low', sp(3, 10)).rule).toBe('Baixa: 5 dias úteis (seg–sex, 8h–18h)');
  });
});
