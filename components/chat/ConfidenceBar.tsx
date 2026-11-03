import type { Tone } from '@/lib/contracts/enums';

export function toneDaConfianca(v: number): Extract<Tone, 'success' | 'warning' | 'danger'> {
  if (v >= 0.8) return 'success';
  if (v >= 0.6) return 'warning';
  return 'danger';
}

const BAR: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};
const TXT: Record<'success' | 'warning' | 'danger', string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
};

/** Confiança declarada: verde ≥ 80%, amarelo 60–80%, vermelho < 60%. */
export function ConfidenceBar({ value }: { value: number }) {
  const tone = toneDaConfianca(value);
  const pct = Math.round(value * 100);
  return (
    <div data-testid="confidence-bar" data-tone={tone} className="flex items-center gap-2.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-desk" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="confiança">
        <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-10 text-right text-label font-semibold ${TXT[tone]}`}>{pct}%</span>
    </div>
  );
}
