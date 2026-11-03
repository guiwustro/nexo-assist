export function Kbd({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={`inline-flex h-4 min-w-4 items-center justify-center rounded-tag px-1 font-sans text-[11px] ${className}`}>
      {children}
    </kbd>
  );
}
