// Routing shell (TLV-2681). Auth handshake -> authed shell -> 5-view
// stack (issue list -> detail -> compose/state-picker/label-picker).
// Telegram BackButton drives back-navigation; hash routing/React Router
// deliberately skipped — the flow is strictly linear and TMAs aren't
// bookmarked by URL (ARCHITECTURE.md §6 non-goals).

import { useCallback, useEffect, useState } from 'react';
import { applyTelegramTheme, watchTelegramTheme } from './telegram/theme';
import { useBackButton } from './telegram/useTelegramButtons';
import { performTelegramLogin, NotInTelegramError } from './api/auth';
import { AuthInvalidError, NoIdentityError } from './api/errors';
import { getDisplayName, isSessionValid } from './api/session';
import { useNavigation, currentScreen } from './store/navigation';
import type { PlaneIssue } from './api/types';
import { IssueListView } from './views/IssueListView';
import { IssueDetailView } from './views/IssueDetailView';
import { CommentComposeView } from './views/CommentComposeView';
import { StatePickerView } from './views/StatePickerView';
import { LabelPickerView } from './views/LabelPickerView';

type AuthState = 'checking' | 'authed' | 'error' | 'not-telegram';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState<unknown>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  // Cache of loaded issues by id — lets the state/label picker views
  // read the issue's current state/labels without re-fetching (the
  // detail view reports what it loaded via onIssueLoaded).
  const [issueCache, setIssueCache] = useState<Record<string, PlaneIssue>>({});

  const { stack, push, pop } = useNavigation();
  const screen = currentScreen(stack);

  useEffect(() => {
    const wa = window.Telegram?.WebApp;
    if (wa) {
      wa.ready();
      wa.expand();
    }
    applyTelegramTheme();
    const unwatch = watchTelegramTheme();

    async function authenticate() {
      if (isSessionValid()) {
        setDisplayName(getDisplayName());
        setAuthState('authed');
        return;
      }
      try {
        const result = await performTelegramLogin();
        setDisplayName(result.display_name);
        setAuthState('authed');
      } catch (e) {
        if (e instanceof NotInTelegramError) {
          setAuthState('not-telegram');
        } else {
          setAuthError(e);
          setAuthState('error');
        }
      }
    }

    authenticate();
    return () => unwatch();
  }, []);

  const goBack = useCallback(() => pop(), [pop]);
  useBackButton(stack.length > 1, goBack);

  function retryAuth() {
    setAuthState('checking');
    setAuthError(null);
    performTelegramLogin()
      .then((result) => {
        setDisplayName(result.display_name);
        setAuthState('authed');
      })
      .catch((e) => {
        setAuthError(e);
        setAuthState('error');
      });
  }

  if (authState === 'checking') {
    return <div className="p-4 text-sm text-tg-hint">Signing in…</div>;
  }
  if (authState === 'not-telegram') {
    return (
      <div className="p-4 text-sm text-tg-destructive">
        This app must be opened from inside Telegram.
      </div>
    );
  }
  if (authState === 'error') {
    const message =
      authError instanceof NoIdentityError
        ? "You don't have a Plane account linked yet. Ask Ed or Werner to set one up."
        : authError instanceof AuthInvalidError
          ? 'Sign-in failed — your Telegram session could not be verified.'
          : authError instanceof Error
            ? authError.message
            : 'Sign-in failed.';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-tg-destructive">{message}</p>
        <button
          type="button"
          onClick={retryAuth}
          className="min-h-[44px] rounded-lg bg-tg-secondary-bg px-4 text-sm font-medium text-tg-text"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tg-bg" title={displayName ?? undefined}>
      {screen.name === 'issue-list' && (
        <IssueListView onOpenIssue={(issueId) => push({ name: 'issue-detail', issueId })} />
      )}

      {screen.name === 'issue-detail' && (
        <IssueDetailView
          issueId={screen.issueId}
          onIssueLoaded={(issue) =>
            setIssueCache((prev) => ({ ...prev, [issue.id]: issue }))
          }
          onComposeComment={() => push({ name: 'comment-compose', issueId: screen.issueId })}
          onEditState={() => push({ name: 'state-picker', issueId: screen.issueId })}
          onEditLabels={() => push({ name: 'label-picker', issueId: screen.issueId })}
        />
      )}

      {screen.name === 'comment-compose' && (
        <CommentComposeView issueId={screen.issueId} onDone={goBack} />
      )}

      {screen.name === 'state-picker' && (
        <StatePickerView
          issueId={screen.issueId}
          currentStateId={issueCache[screen.issueId]?.state ?? ''}
          onDone={goBack}
        />
      )}

      {screen.name === 'label-picker' && (
        <LabelPickerView
          issueId={screen.issueId}
          currentLabelIds={issueCache[screen.issueId]?.labels ?? []}
          onDone={goBack}
        />
      )}
    </div>
  );
}
