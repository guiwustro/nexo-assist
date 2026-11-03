import { Info, TriangleAlert } from 'lucide-react';

export function Banner({
  tone = 'warning',
  children,
  action,
  testId,
}: {
  tone?: 'warning' | 'primary' | 'danger';
  children: React.ReactNode;
  action?: React.ReactNode;
  testId?: string;
}) {
  const cls =
    tone === 'warning'
      ? 'bg-warning-soft text-warning-text'
      : tone === 'danger'
        ? 'bg-danger-soft text-danger-text'
        : 'bg-primary-soft text-primary-text';
  const Icon = tone === 'primary' ? Info : TriangleAlert;
  return (
    <div role="status" data-testid={testId} className={`flex items-center gap-2.5 rounded-bubble px-3.5 py-2.5 text-body ${cls}`}>
      <Icon size={15} className="shrink-0" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
