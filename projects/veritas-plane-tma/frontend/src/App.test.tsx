// Smoke test: full auth handshake -> issue list render, with fetch and
// window.Telegram mocked. Covers the delivery gate item "auth handshake
// works end-to-end (initData -> session -> authorized call -> data)" at
// the component level, since a real Telegram client isn't available in
// this environment (manual on-device test still required per TLV-2681's
// acceptance criteria \u2014 this is a stand-in, not a replacement).

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { clearSession } from './api/session';
import { CONTENT_FACTORY_PROJECT_ID } from './config';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => '1' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSession();
    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: 'raw-init-data',
        initDataUnsafe: {},
        version: '7.0',
        colorScheme: 'light',
        themeParams: {},
        viewportHeight: 600,
        viewportStableHeight: 600,
        isExpanded: false,
        MainButton: {
          isVisible: false,
          isActive: true,
          text: '',
          show: vi.fn(),
          hide: vi.fn(),
          enable: vi.fn(),
          disable: vi.fn(),
          setText: vi.fn(),
          showProgress: vi.fn(),
          hideProgress: vi.fn(),
          onClick: vi.fn(),
          offClick: vi.fn(),
          setParams: vi.fn(),
        },
        BackButton: { isVisible: false, show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
        HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn(), selectionChanged: vi.fn() },
        ready: vi.fn(),
        expand: vi.fn(),
        close: vi.fn(),
        onEvent: vi.fn(),
        offEvent: vi.fn(),
        setHeaderColor: vi.fn(),
        setBackgroundColor: vi.fn(),
      },
    };
  });

  afterEach(() => {
    (window as unknown as { Telegram?: unknown }).Telegram = undefined;
    vi.unstubAllGlobals();
  });

  it('authenticates then renders the issue list from the live API shape', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/auth/telegram-login') {
        return Promise.resolve(
          jsonResponse(200, {
            session_token: 'tok-abc',
            display_name: 'Werner',
            expires_in_seconds: 900,
          }),
        );
      }
      if (url === `/api/projects/${CONTENT_FACTORY_PROJECT_ID}/issues`) {
        return Promise.resolve(
          jsonResponse(200, [
            {
              id: '893d7c24-322c-4f35-8f7a-e5592245faf2',
              name: 'Webhook isolation test - clean create',
              description_html: '<p></p>',
              state: 'ca9cc4c8-8890-48ac-b718-3b66a8441891',
              priority: 'none',
              sequence_id: 6,
              labels: [],
            },
          ]),
        );
      }
      if (url === `/api/projects/${CONTENT_FACTORY_PROJECT_ID}/labels`) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(jsonResponse(404, { detail: 'unexpected url in test' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(screen.getByText(/signing in/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Webhook isolation test - clean create')).toBeInTheDocument();
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText(/VER-6/)).toBeInTheDocument();
  });

  it('shows the not-in-telegram message when initData is missing', async () => {
    (window as unknown as { Telegram?: unknown }).Telegram = undefined;
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/must be opened from inside Telegram/i)).toBeInTheDocument();
    });
  });
});
