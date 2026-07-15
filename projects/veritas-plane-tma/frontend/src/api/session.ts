// Session storage for the short-lived HMAC session token minted by
// POST /auth/telegram-login (TLV-2679/2681). Deliberately sessionStorage,
// not localStorage — token should not outlive the Telegram WebView tab
// and there's no "remember me" requirement (dispatch: "session_token in
// memory only, backend URL from env").

import type { TelegramLoginResponse } from './types';

const STORAGE_KEY = 'veritas_tma_session_v1';

interface StoredSession {
  sessionToken: string;
  displayName: string;
  /** epoch ms when this token should be treated as expired. */
  expiresAt: number;
}

let cached: StoredSession | null = null;

function readFromStorage(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function writeToStorage(session: StoredSession | null): void {
  try {
    if (session) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable (e.g. private mode edge cases) — fall
    // back to the in-memory cache only; re-auth on reload is acceptable.
  }
}

export function setSession(login: TelegramLoginResponse): void {
  cached = {
    sessionToken: login.session_token,
    displayName: login.display_name,
    expiresAt: Date.now() + login.expires_in_seconds * 1000,
  };
  writeToStorage(cached);
}

export function clearSession(): void {
  cached = null;
  writeToStorage(null);
}

export function getSessionToken(): string | null {
  if (!cached) cached = readFromStorage();
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    clearSession();
    return null;
  }
  return cached.sessionToken;
}

export function getDisplayName(): string | null {
  if (!cached) cached = readFromStorage();
  return cached?.displayName ?? null;
}

export function isSessionValid(): boolean {
  return getSessionToken() !== null;
}
