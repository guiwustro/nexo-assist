export function Spinner({ size = 14, className = '', testId }: { size?: number; className?: string; testId?: string }) {
  return (
    <span
      role="status"
      aria-label="carregando"
      data-testid={testId}
      className={`inline-block shrink-0 rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ width: size, height: size, animation: 'nexo-spin 0.7s linear infinite' }}
    />
  );
}
