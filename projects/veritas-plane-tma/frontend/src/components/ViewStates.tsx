// Shared loading/error/empty state components — every view (list,
// detail, comments) uses the same three per Leo's dispatch checklist
// ("empty/loading/error states in every view"). Conservative Telegram-
// native styling: centered text, tg-hint for secondary copy, tg-
// destructive for errors, no custom illustrations (no design spec to
// draw from — ship plain, iterate after Werner feedback per Leo's
// design-routing addendum).

import { AuthInvalidError, NoIdentityError, UpstreamError } from '../api/errors';

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <p className="text-sm text-tg-hint">{label}</p>
    </div>
  );
}

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex min-h-[30vh] items-center justify-center p-6 text-center">
      <p className="text-sm text-tg-hint">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

function messageFor(error: unknown): string {
  if (error instanceof NoIdentityError) {
    return "You don't have a Plane account linked yet. Ask Ed or Werner to set one up.";
  }
  if (error instanceof AuthInvalidError) {
    return 'Your session expired. Reopen the app to sign in again.';
  }
  if (error instanceof UpstreamError) {
    return 'Plane is temporarily unavailable. Try again in a moment.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-tg-destructive">{messageFor(error)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] rounded-lg bg-tg-secondary-bg px-4 text-sm font-medium text-tg-text"
        >
          Retry
        </button>
      )}
    </div>
  );
}
