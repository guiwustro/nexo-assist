export function UserBubble({ children, failed, onRetry }: { children: React.ReactNode; failed?: boolean; onRetry?: () => void }) {
  return (
    <div data-testid="user-message" className="flex flex-col items-end gap-1">
      <div
        className={`max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-value whitespace-pre-wrap text-white ${
          failed ? 'opacity-50' : ''
        }`}
      >
        {children}
      </div>
      {failed && (
        <button type="button" onClick={onRetry} className="text-label text-danger-text hover:underline">
          Não enviada · Tentar de novo
        </button>
      )}
    </div>
  );
}

export function AgentBubble({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="flex w-[600px] max-w-full flex-col gap-3 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3 text-value text-ink"
    >
      {children}
    </div>
  );
}
