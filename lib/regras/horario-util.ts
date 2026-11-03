import { TZDate } from '@date-fns/tz';

export const FUSO = 'America/Sao_Paulo';
export const ABERTURA = 8;
export const FECHAMENTO = 18;
export const HORAS_POR_DIA_UTIL = FECHAMENTO - ABERTURA;

const MIN = 60_000;

function emSp(ms: number): TZDate {
  return new TZDate(ms, FUSO);
}

function noHorario(d: TZDate, hora: number): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), hora, 0, 0, FUSO);
}

function proximoDia(d: TZDate): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + 1, ABERTURA, 0, 0, FUSO);
}

/** Leva o instante para dentro do expediente (seg–sex, 8h–18h em São Paulo). */
function normalizar(d: TZDate): TZDate {
  let atual = d;
  for (;;) {
    const dia = atual.getDay();
    if (dia === 0 || dia === 6) {
      atual = proximoDia(atual);
      continue;
    }
    const abertura = noHorario(atual, ABERTURA);
    if (atual.getTime() < abertura.getTime()) return abertura;
    if (atual.getTime() >= noHorario(atual, FECHAMENTO).getTime()) {
      atual = proximoDia(atual);
      continue;
    }
    return atual;
  }
}

export function addBusinessHours(from: Date, hours: number): Date {
  let restante = Math.round(hours * 60);
  let atual = emSp(from.getTime());
  while (restante > 0) {
    atual = normalizar(atual);
    const fim = noHorario(atual, FECHAMENTO);
    const disponivel = Math.floor((fim.getTime() - atual.getTime()) / MIN);
    if (restante <= disponivel) return new Date(atual.getTime() + restante * MIN);
    restante -= disponivel;
    atual = fim;
  }
  return new Date(atual.getTime());
}

/** Um dia útil = 10 horas úteis. */
export function addBusinessDays(from: Date, days: number): Date {
  return addBusinessHours(from, days * HORAS_POR_DIA_UTIL);
}
