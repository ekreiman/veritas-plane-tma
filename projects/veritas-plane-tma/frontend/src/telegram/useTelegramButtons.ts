// Helpers to drive Telegram's native BackButton and MainButton from React.
// Extracted verbatim from the retired Kanban TMA build (Hugo, 2026-07-13)
// — pure Telegram SDK integration, no Kanban-specific content, reused
// as-is.

import { useEffect } from 'react';

export function useBackButton(visible: boolean, onClick: () => void) {
  useEffect(() => {
    const btn = window.Telegram?.WebApp?.BackButton;
    if (!btn) return;

    if (visible) {
      btn.onClick(onClick);
      btn.show();
    } else {
      btn.hide();
    }

    return () => {
      btn.offClick(onClick);
      btn.hide();
    };
  }, [visible, onClick]);
}

interface MainButtonOpts {
  visible: boolean;
  text: string;
  onClick: () => void;
  loading?: boolean;
  active?: boolean;
}

export function useMainButton({
  visible,
  text,
  onClick,
  loading = false,
  active = true,
}: MainButtonOpts) {
  useEffect(() => {
    const btn = window.Telegram?.WebApp?.MainButton;
    if (!btn) return;

    if (!visible) {
      btn.hide();
      return;
    }

    btn.setText(text);
    btn.onClick(onClick);
    if (active) btn.enable();
    else btn.disable();
    if (loading) btn.showProgress(false);
    else btn.hideProgress();
    btn.show();

    return () => {
      btn.offClick(onClick);
      btn.hideProgress();
      btn.hide();
    };
  }, [visible, text, onClick, loading, active]);
}

export function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  } catch {
    // no-op outside Telegram
  }
}

export function hapticNotify(type: 'error' | 'success' | 'warning') {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
  } catch {
    // no-op
  }
}
