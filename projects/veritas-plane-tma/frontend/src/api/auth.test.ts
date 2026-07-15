import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotInTelegramError, performTelegramLogin } from './auth';
import { AuthInvalidError, NoIdentityError } from './errors';
import { clearSession, getSessionToken } from './session';

function setTelegramInitData(initData: string | undefined) {
  (window as unknown as { Telegram?: unknown }).Telegram = initData
    ? { WebApp: { initData } }
    : undefined;
}

describe('performTelegramLogin', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSession();
  });

  afterEach(() => {
    setTelegramInitData(undefined);
    vi.unstubAllGlobals();
  });

  it('throws NotInTelegramError when initData is unavailable', async () => {
    setTelegramInitData(undefined);
    await expect(performTelegramLogin()).rejects.toBeInstanceOf(NotInTelegramError);
  });

  it('posts initData and persists the session on success', async () => {
    setTelegramInitData('raw-init-data');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        session_token: 'tok-abc',
        display_name: 'Werner',
        expires_in_seconds: 900,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await performTelegramLogin();

    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/telegram-login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ initData: 'raw-init-data' }),
      }),
    );
    expect(result.display_name).toBe('Werner');
    expect(getSessionToken()).toBe('tok-abc');
  });

  it('throws AuthInvalidError on 401', async () => {
    setTelegramInitData('raw-init-data');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'invalid or expired initData' }),
      }),
    );

    await expect(performTelegramLogin()).rejects.toBeInstanceOf(AuthInvalidError);
  });

  it('throws NoIdentityError on 403', async () => {
    setTelegramInitData('raw-init-data');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'no Plane identity mapped for this Telegram user' }),
      }),
    );

    await expect(performTelegramLogin()).rejects.toBeInstanceOf(NoIdentityError);
  });
});
