// Bridges Telegram theme params into CSS variables. Extracted verbatim
// from the retired Kanban TMA build (Hugo, 2026-07-13) — pure Telegram
// SDK integration, no Kanban-specific content, reused as-is.

const FALLBACKS: Record<string, string> = {
  '--tg-bg': '#ffffff',
  '--tg-secondary-bg': '#f1f1f4',
  '--tg-text': '#000000',
  '--tg-hint': '#8e8e93',
  '--tg-link': '#2481cc',
  '--tg-button': '#2481cc',
  '--tg-button-text': '#ffffff',
  '--tg-header-bg': '#ffffff',
  '--tg-destructive': '#e53935',
};

export function applyTelegramTheme(): void {
  const root = document.documentElement;
  const wa = window.Telegram?.WebApp;
  const p = wa?.themeParams ?? {};

  const map: Record<string, string | undefined> = {
    '--tg-bg': p.bg_color,
    '--tg-secondary-bg': p.secondary_bg_color,
    '--tg-text': p.text_color,
    '--tg-hint': p.hint_color,
    '--tg-link': p.link_color,
    '--tg-button': p.button_color,
    '--tg-button-text': p.button_text_color,
    '--tg-header-bg': p.header_bg_color,
    '--tg-destructive': p.destructive_text_color,
  };

  for (const [key, fallback] of Object.entries(FALLBACKS)) {
    root.style.setProperty(key, map[key] || fallback);
  }

  // Sync native chrome to the theme background.
  if (wa) {
    try {
      wa.setHeaderColor(p.header_bg_color || p.bg_color || '#ffffff');
      wa.setBackgroundColor(p.bg_color || '#ffffff');
    } catch {
      // Older clients may not support these; ignore.
    }
  }
}

// Subscribe to Telegram themeChanged so live theme switches propagate.
export function watchTelegramTheme(): () => void {
  const wa = window.Telegram?.WebApp;
  if (!wa) return () => {};
  const handler = () => applyTelegramTheme();
  wa.onEvent('themeChanged', handler);
  return () => wa.offEvent('themeChanged', handler);
}
