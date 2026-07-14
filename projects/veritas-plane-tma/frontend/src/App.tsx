// Scaffold entry point. Wires the Telegram theme + auth handshake; the
// actual Plane-backed views (issue list, task detail, comments) are NOT
// built yet — this is the starting skeleton, not a working app.

import { useEffect, useState } from 'react';
import { applyTelegramTheme, watchTelegramTheme } from './telegram/theme';

type AuthState = 'checking' | 'authed' | 'error' | 'not-telegram';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const wa = window.Telegram?.WebApp;
    if (wa) {
      wa.ready();
      wa.expand();
    }
    applyTelegramTheme();
    const unwatch = watchTelegramTheme();

    async function authenticate() {
      if (!wa || !wa.initData) {
        setAuthState('not-telegram');
        return;
      }
      try {
        // TODO: POST wa.initData to the backend once it exists. The backend
        // should: 1) validate_init_data() (see auth/telegram_init_data.py),
        // 2) resolve_plane_identity() (see auth/telegram_user_map.py),
        // 3) return a short-lived session the frontend uses for subsequent
        // Plane-proxy calls. No such backend endpoint exists yet.
        const res = await fetch('/auth/telegram-login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: wa.initData }),
        });
        if (!res.ok) throw new Error(`auth failed (${res.status})`);
        setAuthState('authed');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Login failed');
        setAuthState('error');
      }
    }

    authenticate();
    return () => unwatch();
  }, []);

  if (authState === 'checking') {
    return <div className="p-4 text-tg-hint">Signing in…</div>;
  }
  if (authState === 'not-telegram') {
    return (
      <div className="p-4 text-tg-destructive">
        This app must be opened from inside Telegram.
      </div>
    );
  }
  if (authState === 'error') {
    return <div className="p-4 text-tg-destructive">Sign-in failed: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-tg-text">Veritas — Plane</h1>
      <p className="text-tg-hint">
        Authenticated. Plane-backed views (issue list, task detail, comments)
        are not built yet — this scaffold only proves the auth handshake
        reaches a backend. Next: build the backend endpoint this calls, plus
        the actual Plane API proxy views.
      </p>
    </div>
  );
}
