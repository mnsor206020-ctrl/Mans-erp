interface BankingListErrorProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export function BankingListError({
  message,
  retryLabel,
  onRetry,
}: BankingListErrorProps) {
  return (
    <div
      role="alert"
      className="flex min-h-9 items-center justify-between gap-2 text-sm text-destructive"
    >
      <span>{message}</span>
      <button
        type="button"
        className="shrink-0 underline underline-offset-2"
        onClick={onRetry}
      >
        {retryLabel}
      </button>
    </div>
  );
}
