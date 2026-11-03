import { TZDate } from '@date-fns/tz';
import type { Priority } from '@/lib/contracts/enums';
import { addBusinessDays, addBusinessHours, FUSO } from './horario-util';

const EXPEDIENTE = '(seg–sex, 8h–18h)';

/** Prazos do Anexo A. Crítica conta corrido (plantão 24h); as demais em horário útil. */
export function calcularPrazo(priority: Priority, desde: Date): { due_at: Date; regra: string } {
  switch (priority) {
    case 'critical':
      return { due_at: new Date(desde.getTime() + 60 * 60_000), regra: 'Crítica: 1 hora corrida (plantão 24h)' };
    case 'high':
      return { due_at: addBusinessHours(desde, 4), regra: `Alta: 4 horas úteis ${EXPEDIENTE}` };
    case 'medium':
      return { due_at: addBusinessDays(desde, 3), regra: `Média: 3 dias úteis ${EXPEDIENTE}` };
    case 'low':
      return { due_at: addBusinessDays(desde, 5), regra: `Baixa: 5 dias úteis ${EXPEDIENTE}` };
  }
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const dois = (n: number) => String(n).padStart(2, '0');

export function horaSp(d: Date): string {
  const z = new TZDate(d.getTime(), FUSO);
  return `${dois(z.getHours())}:${dois(z.getMinutes())}`;
}

export function mesmoDiaSp(a: Date, b: Date): boolean {
  const x = new TZDate(a.getTime(), FUSO);
  const y = new TZDate(b.getTime(), FUSO);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** "resposta até 13:43" (hoje) ou "resposta até qua 10:00" (outro dia). */
export function formatarPrazoCurto(due: Date, agora: Date): string {
  if (mesmoDiaSp(due, agora)) return `resposta até ${horaSp(due)}`;
  const z = new TZDate(due.getTime(), FUSO);
  return `resposta até ${DIAS[z.getDay()]} ${horaSp(due)}`;
}
