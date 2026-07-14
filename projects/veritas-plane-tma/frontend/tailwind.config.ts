import type { Config } from 'tailwindcss';

// Colors map to CSS variables populated from Telegram.WebApp.themeParams
// (see src/telegram/theme.ts). Extracted from the retired Kanban build —
// this config is app-agnostic, no changes needed.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: 'var(--tg-bg)',
          'secondary-bg': 'var(--tg-secondary-bg)',
          text: 'var(--tg-text)',
          hint: 'var(--tg-hint)',
          link: 'var(--tg-link)',
          button: 'var(--tg-button)',
          'button-text': 'var(--tg-button-text)',
          header: 'var(--tg-header-bg)',
          destructive: 'var(--tg-destructive)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
