// Minimal typings for the subset of the Telegram WebApp SDK we use.
// Extracted verbatim from the retired veritas-hermes Kanban TMA build
// (Hugo/wordpress-engineer, 2026-07-13) — this file is pure Telegram SDK
// surface, zero Kanban-specific content, reused as-is.
export {};

interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  header_bg_color?: string;
  destructive_text_color?: string;
}

interface TelegramButton {
  isVisible: boolean;
  isActive: boolean;
  text: string;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  setText(text: string): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  setParams(params: {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
  }): void;
}

interface TelegramBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TelegramHaptic {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; username?: string; first_name?: string } };
  version: string;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  MainButton: TelegramButton;
  BackButton: TelegramBackButton;
  HapticFeedback: TelegramHaptic;
  ready(): void;
  expand(): void;
  close(): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}
