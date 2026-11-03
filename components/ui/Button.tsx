import type { ButtonHTMLAttributes } from 'react';

type Variant = 'cta' | 'outline' | 'ghost' | 'danger-soft';

const VARIANT: Record<Variant, string> = {
  cta: 'bg-cta text-white hover:brightness-110 disabled:opacity-70',
  outline: 'bg-paper text-ink-2 border border-input-border hover:bg-desk disabled:opacity-60',
  ghost: 'text-ink-2 hover:bg-desk disabled:opacity-60',
  'danger-soft': 'bg-danger-soft text-danger-text hover:brightness-95 disabled:opacity-60',
};

export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-btn px-3.5 text-body font-medium transition disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
    />
  );
}
