// Auth handshake: POST initData -> session token (TLV-2679 contract).
// Split out from client.ts so the fetch wrapper can call this on 401
// without a circular import (client.ts imports from here, not vice versa).

import { AuthInvalidError, NoIdentityError } from './errors';
import { setSession } from './session';
import type { TelegramLoginResponse } from './types';

export class NotInTelegramError extends Error {
  constructor() {
    super('This app must be opened from inside Telegram.');
    this.name = 'NotInTelegramError';
  }
}

/**
 * Run the Telegram initData -> session token handshake and persist the
 * result. Throws `NotInTelegramError` if window.Telegram.WebApp.initData
 * is unavailable, `AuthInvalidError` on 401, `NoIdentityError` on 403.
 */
export async function performTelegramLogin(): Promise<TelegramLoginResponse> {
  const wa = window.Telegram?.WebApp;
  const initData = wa?.initData;
  if (!initData) {
    throw new NotInTelegramError();
  }

  const res = await fetch('/auth/telegram-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  if (res.status === 401) {
    const detail = await safeJson(res);
    throw new AuthInvalidError(detail);
  }
  if (res.status === 403) {
    const detail = await safeJson(res);
    throw new NoIdentityError(detail);
  }
  if (!res.ok) {
    const detail = await safeJson(res);
    throw new Error(`auth failed (${res.status}): ${JSON.stringify(detail)}`);
  }

  const body = (await res.json()) as TelegramLoginResponse;
  setSession(body);
  return body;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
