import type { Tone } from '@/lib/contracts/enums';

export const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary-text',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  neutral: 'text-ink-2',
  muted: 'text-ink-3',
};

export const TONE_SOFT: Record<Tone, string> = {
  primary: 'bg-primary-soft text-primary-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  neutral: 'bg-desk text-ink-2',
  muted: 'bg-desk text-ink-3',
};

export const TONE_DOT: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-prio-medium',
  muted: 'bg-ink-3',
};

export function Dot({ tone, className = '' }: { tone: Tone; className?: string }) {
  return <span className={`inline-block size-[7px] shrink-0 rounded-full ${TONE_DOT[tone]} ${className}`} />;
}

export function Tag({ tone, children, className = '' }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-tag px-1.5 py-0.5 text-tag font-semibold ${TONE_SOFT[tone]} ${className}`}>
      {children}
    </span>
  );
}
