import { TZDate } from '@date-fns/tz';

const TIMEZONE = 'America/Sao_Paulo';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "16 out" */
export function shortDate(iso: string | Date): string {
  const z = new TZDate(new Date(iso).getTime(), TIMEZONE);
  return `${pad2(z.getDate())} ${MONTHS[z.getMonth()]}`;
}

/** "16 out, 14:20" */
export function dateTime(iso: string | Date): string {
  const z = new TZDate(new Date(iso).getTime(), TIMEZONE);
  return `${shortDate(iso)}, ${pad2(z.getHours())}:${pad2(z.getMinutes())}`;
}

/** "14:20" */
export function time(iso: string | Date): string {
  const z = new TZDate(new Date(iso).getTime(), TIMEZONE);
  return `${pad2(z.getHours())}:${pad2(z.getMinutes())}`;
}

/** "hoje", "há 1 dia", "há 6 dias" (dias corridos). */
export function daysAgo(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoje';
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** Hora da lista do console: "10:05" (hoje), "ontem", "16 out". */
export function shortWhen(iso: string | null, now: Date): string {
  if (!iso) return '';
  const d = new TZDate(new Date(iso).getTime(), TIMEZONE);
  const a = new TZDate(now.getTime(), TIMEZONE);
  const sameDay = d.getFullYear() === a.getFullYear() && d.getMonth() === a.getMonth() && d.getDate() === a.getDate();
  if (sameDay) return Math.abs(now.getTime() - d.getTime()) < 60_000 ? 'agora' : time(iso);
  const yesterday = new TZDate(a.getFullYear(), a.getMonth(), a.getDate() - 1, 12, 0, 0, TIMEZONE);
  if (d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()) {
    return 'ontem';
  }
  return shortDate(iso);
}
