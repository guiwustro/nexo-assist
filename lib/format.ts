import { TZDate } from '@date-fns/tz';

const FUSO = 'America/Sao_Paulo';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dois = (n: number) => String(n).padStart(2, '0');

/** "16 out" */
export function dataCurta(iso: string | Date): string {
  const z = new TZDate(new Date(iso).getTime(), FUSO);
  return `${dois(z.getDate())} ${MESES[z.getMonth()]}`;
}

/** "16 out, 14:20" */
export function dataHora(iso: string | Date): string {
  const z = new TZDate(new Date(iso).getTime(), FUSO);
  return `${dataCurta(iso)}, ${dois(z.getHours())}:${dois(z.getMinutes())}`;
}

/** "14:20" */
export function hora(iso: string | Date): string {
  const z = new TZDate(new Date(iso).getTime(), FUSO);
  return `${dois(z.getHours())}:${dois(z.getMinutes())}`;
}

/** "hoje", "há 1 dia", "há 6 dias" (dias corridos). */
export function haQuanto(iso: string, agora: Date): string {
  const dias = Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

/** Hora da lista do console: "10:05" (hoje), "ontem", "16 out". */
export function quandoCurto(iso: string | null, agora: Date): string {
  if (!iso) return '';
  const d = new TZDate(new Date(iso).getTime(), FUSO);
  const a = new TZDate(agora.getTime(), FUSO);
  const mesmoDia = d.getFullYear() === a.getFullYear() && d.getMonth() === a.getMonth() && d.getDate() === a.getDate();
  if (mesmoDia) return Math.abs(agora.getTime() - d.getTime()) < 60_000 ? 'agora' : hora(iso);
  const ontem = new TZDate(a.getFullYear(), a.getMonth(), a.getDate() - 1, 12, 0, 0, FUSO);
  if (d.getFullYear() === ontem.getFullYear() && d.getMonth() === ontem.getMonth() && d.getDate() === ontem.getDate()) {
    return 'ontem';
  }
  return dataCurta(iso);
}
