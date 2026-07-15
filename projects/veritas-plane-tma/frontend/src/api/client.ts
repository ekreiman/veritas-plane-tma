// Fetch wrapper for the frozen 6-endpoint Plane-proxy API (TLV-2680).
// Injects `Authorization: Bearer <session_token>`, re-runs the auth
// handshake once on 401, retries once with backoff on 502, and maps
// every failure mode to a typed error from ./errors.

import { performTelegramLogin } from './auth';
import { AuthInvalidError, BadRequestError, NoIdentityError, UpstreamError } from './errors';
import { clearSession, getSessionToken } from './session';

// Base URL is same-origin by default (Caddy fronts backend + static
// bundle behind one host in staging/prod; Vite dev proxy handles /api
// and /auth locally — see vite.config.ts). Override via env if the
// backend ever lives on a different origin.
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  /** Internal: set true on the retry-after-reauth call to avoid loops. */
  _isRetry?: boolean;
  /** Internal: set true on the retry-after-502 call to avoid loops. */
  _is502Retry?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, _isRetry = false, _is502Retry = false } = opts;

  const token = getSessionToken();
  if (!token && !_isRetry) {
    // No valid session at all — run the handshake before the first call
    // rather than firing a doomed request and catching the 401.
    await performTelegramLogin();
  }

  const headers: Record<string, string> = {};
  const authToken = getSessionToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearSession();
    if (_isRetry) {
      // Re-auth already attempted once this call chain — surface it.
      throw new AuthInvalidError(await safeJson(res));
    }
    await performTelegramLogin();
    return request<T>(path, { ...opts, _isRetry: true });
  }

  if (res.status === 403) {
    throw new NoIdentityError(await safeJson(res));
  }

  if (res.status === 400) {
    throw new BadRequestError(await safeJson(res));
  }

  if (res.status === 502) {
    if (_is502Retry) {
      throw new UpstreamError(await safeJson(res));
    }
    await sleep(500);
    return request<T>(path, { ...opts, _is502Retry: true });
  }

  if (!res.ok) {
    throw new Error(`unexpected API error ${res.status}: ${JSON.stringify(await safeJson(res))}`);
  }

  if (res.status === 204 || !res.headers.get('content-length')) {
    // 201/200 with empty body still parses fine via .json() normally,
    // but guard the true no-content case.
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
};
