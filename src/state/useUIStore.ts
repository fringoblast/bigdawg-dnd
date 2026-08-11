import { create } from 'zustand';

export type Tab = 'story' | 'character' | 'dice' | 'inventory' | 'world';

interface UIState {
  tab: Tab;
  settingsOpen: boolean;
  toast: { id: number; text: string; tone?: 'info' | 'success' | 'warn' | 'error' } | null;
  worldNotif: boolean;
  setTab: (t: Tab) => void;
  openSettings: () => void;
  closeSettings: () => void;
  showToast: (text: string, tone?: 'info' | 'success' | 'warn' | 'error', durationMs?: number) => void;
  clearToast: () => void;
  setWorldNotif: (v: boolean) => void;
}

const TOAST_DEFAULT_MS = 3500;

export const useUIStore = create<UIState>((set, get) => ({
  tab: 'story',
  settingsOpen: false,
  toast: null,
  worldNotif: false,
  setTab: (t) => set({ tab: t }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  showToast: (text, tone = 'info', durationMs = TOAST_DEFAULT_MS) => {
    const id = Date.now() + Math.random();
    set({ toast: { id, text, tone } });
    if (durationMs > 0) {
      setTimeout(() => {
        const cur = get().toast;
        if (cur && cur.id === id) set({ toast: null });
      }, durationMs);
    }
  },
  clearToast: () => set({ toast: null }),
  setWorldNotif: (v) => set({ worldNotif: v })
}));
