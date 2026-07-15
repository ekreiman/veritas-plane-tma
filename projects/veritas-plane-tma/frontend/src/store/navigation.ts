// Navigation stack for the TMA's 5 views. No React Router — the flow is
// strictly linear (list -> detail -> {compose, state picker, label
// picker}), so a simple push/pop stack backed by Telegram's native
// BackButton (see telegram/useTelegramButtons.ts) covers every case
// without pulling in a routing library. No URL sync needed — Telegram
// Mini Apps don't get bookmarked/shared by URL.

import { create } from 'zustand';

export type Screen =
  | { name: 'issue-list' }
  | { name: 'issue-detail'; issueId: string }
  | { name: 'comment-compose'; issueId: string }
  | { name: 'state-picker'; issueId: string }
  | { name: 'label-picker'; issueId: string };

interface NavigationState {
  stack: Screen[];
  push: (screen: Screen) => void;
  pop: () => void;
  replaceRoot: (screen: Screen) => void;
}

export const useNavigation = create<NavigationState>((set, get) => ({
  stack: [{ name: 'issue-list' }],
  push: (screen) => set({ stack: [...get().stack, screen] }),
  pop: () =>
    set((state) => (state.stack.length > 1 ? { stack: state.stack.slice(0, -1) } : state)),
  replaceRoot: (screen) => set({ stack: [screen] }),
}));

export function currentScreen(stack: Screen[]): Screen {
  return stack[stack.length - 1];
}
