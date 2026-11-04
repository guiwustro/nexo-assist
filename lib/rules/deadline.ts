import { TZDate } from '@date-fns/tz';
import type { Priority } from '@/lib/contracts/enums';
import { addBusinessDays, addBusinessHours, TIMEZONE } from './business-hours';

const BUSINESS_HOURS = '(seg–sex, 8h–18h)';

/** Prazos do Anexo A. Crítica conta corrido (plantão 24h); as demais em horário útil. */
export function computeDeadline(priority: Priority, since: Date): { due_at: Date; rule: string } {
  switch (priority) {
    case 'critical':
      return { due_at: new Date(since.getTime() + 60 * 60_000), rule: 'Crítica: 1 hora corrida (plantão 24h)' };
    case 'high':
      return { due_at: addBusinessHours(since, 4), rule: `Alta: 4 horas úteis ${BUSINESS_HOURS}` };
    case 'medium':
      return { due_at: addBusinessDays(since, 3), rule: `Média: 3 dias úteis ${BUSINESS_HOURS}` };
    case 'low':
      return { due_at: addBusinessDays(since, 5), rule: `Baixa: 5 dias úteis ${BUSINESS_HOURS}` };
  }
}

const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');

export function timeInSaoPaulo(d: Date): string {
  const z = new TZDate(d.getTime(), TIMEZONE);
  return `${pad2(z.getHours())}:${pad2(z.getMinutes())}`;
}

export function isSameDayInSaoPaulo(a: Date, b: Date): boolean {
  const x = new TZDate(a.getTime(), TIMEZONE);
  const y = new TZDate(b.getTime(), TIMEZONE);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** "resposta até 13:43" (hoje) ou "resposta até qua 10:00" (outro dia). */
export function formatShortDeadline(due: Date, now: Date): string {
  if (isSameDayInSaoPaulo(due, now)) return `resposta até ${timeInSaoPaulo(due)}`;
  const z = new TZDate(due.getTime(), TIMEZONE);
  return `resposta até ${DAYS[z.getDay()]} ${timeInSaoPaulo(due)}`;
}
