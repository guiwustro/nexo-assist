import { TZDate } from '@date-fns/tz';

export const TIMEZONE = 'America/Sao_Paulo';
export const OPENING_HOUR = 8;
export const CLOSING_HOUR = 18;
export const BUSINESS_HOURS_PER_DAY = CLOSING_HOUR - OPENING_HOUR;

const MIN = 60_000;

function inSaoPaulo(ms: number): TZDate {
  return new TZDate(ms, TIMEZONE);
}

function isWithinBusinessHours(d: TZDate, time: number): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), time, 0, 0, TIMEZONE);
}

function nextBusinessDay(d: TZDate): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + 1, OPENING_HOUR, 0, 0, TIMEZONE);
}

/** Leva o instante para dentro do expediente (seg–sex, 8h–18h em São Paulo). */
function normalize(d: TZDate): TZDate {
  let current = d;
  for (;;) {
    const day = current.getDay();
    if (day === 0 || day === 6) {
      current = nextBusinessDay(current);
      continue;
    }
    const opening = isWithinBusinessHours(current, OPENING_HOUR);
    if (current.getTime() < opening.getTime()) return opening;
    if (current.getTime() >= isWithinBusinessHours(current, CLOSING_HOUR).getTime()) {
      current = nextBusinessDay(current);
      continue;
    }
    return current;
  }
}

export function addBusinessHours(from: Date, hours: number): Date {
  let remaining = Math.round(hours * 60);
  let current = inSaoPaulo(from.getTime());
  while (remaining > 0) {
    current = normalize(current);
    const end = isWithinBusinessHours(current, CLOSING_HOUR);
    const available = Math.floor((end.getTime() - current.getTime()) / MIN);
    if (remaining <= available) return new Date(current.getTime() + remaining * MIN);
    remaining -= available;
    current = end;
  }
  return new Date(current.getTime());
}

/** Um dia útil = 10 horas úteis. */
export function addBusinessDays(from: Date, days: number): Date {
  return addBusinessHours(from, days * BUSINESS_HOURS_PER_DAY);
}
