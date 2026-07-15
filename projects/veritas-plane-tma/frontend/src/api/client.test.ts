import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { BadRequestError, NoIdentityError, UpstreamError } from './errors';
import { clearSession, setSession } from './session';

function setTelegramInitData(initData: string | undefined) {
  (window as unknown as { Telegram?: unknown }).Telegram = initData
    ? { WebApp: { initData } }
    : undefined;
}

function jsonResponse(status: number, body: unknown, ok = status < 400) {
  return {
    ok,
    status,
    headers: { get: () => '1' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('api client', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSession();
    setTelegramInitData('raw-init-data');
  });

  afterEach(() => {
    setTelegramInitData(undefined);
    vi.unstubAllGlobals();
  });

  it('injects the Authorization header on an authenticated GET', async () => {
    setSession({ session_token: 'tok-1', display_name: 'Werner', expires_in_seconds: 900 });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [{ id: '1' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get('/api/projects/p1/issues');

    expect(result).toEqual([{ id: '1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/issues',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer tok-1' },
      }),
    );
  });

  it('re-runs the auth handshake once on 401 and retries the call', async () => {
    setSession({ session_token: 'expired-tok', display_name: 'Werner', expires_in_seconds: 900 });
    const fetchMock = vi
      .fn()
      // First call: the GET, gets 401.
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'invalid or expired session token' }))
      // Second call: re-auth handshake POST /auth/telegram-login.
      .mockResolvedValueOnce(
        jsonResponse(200, {
          session_token: 'fresh-tok',
          display_name: 'Werner',
          expires_in_seconds: 900,
        }),
      )
      // Third call: the retried GET, succeeds with the new token.
      .mockResolvedValueOnce(jsonResponse(200, [{ id: '1' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get('/api/projects/p1/issues');

    expect(result).toEqual([{ id: '1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdCallHeaders = fetchMock.mock.calls[2][1].headers;
    expect(thirdCallHeaders.Authorization).toBe('Bearer fresh-tok');
  });

  it('throws NoIdentityError on 403 without retrying', async () => {
    setSession({ session_token: 'tok-1', display_name: 'Werner', expires_in_seconds: 900 });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(403, { detail: 'no Plane identity mapped for this Telegram user' }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/api/projects/p1/issues')).rejects.toBeInstanceOf(NoIdentityError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws BadRequestError on 400 (PATCH disallowed field)', async () => {
    setSession({ session_token: 'tok-1', display_name: 'Werner', expires_in_seconds: 900 });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { detail: "disallowed field(s): ['priority']" }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      api.patch('/api/projects/p1/issues/i1', { priority: 'urgent' }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('retries once on 502 then throws UpstreamError if it persists', async () => {
    setSession({ session_token: 'tok-1', display_name: 'Werner', expires_in_seconds: 900 });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(502, { detail: 'upstream Plane API request failed' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/api/projects/p1/issues')).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('succeeds on a 502 that resolves on retry', async () => {
    setSession({ session_token: 'tok-1', display_name: 'Werner', expires_in_seconds: 900 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { detail: 'upstream Plane API request failed' }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: '1' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get('/api/projects/p1/issues');
    expect(result).toEqual([{ id: '1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
