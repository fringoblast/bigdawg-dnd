// Waits until every persisted store has finished hydrating from IndexedDB so
// the first paint never shows an empty state that later "pops" into data.

import { useCharacterStore } from '@/state/useCharacterStore';
import { useSessionStore } from '@/state/useSessionStore';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useChatStore } from '@/state/useChatStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useNPCStore } from '@/state/useNPCStore';
import { useRollStore } from '@/state/useRollStore';

const stores = [
  useCharacterStore,
  useSessionStore,
  useSettingsStore,
  useChatStore,
  useWorldStore,
  useNPCStore,
  useRollStore
];

let resolved = false;
let promise: Promise<void> | null = null;

export const waitForHydration = (): Promise<void> => {
  if (resolved) return Promise.resolve();
  if (promise) return promise;
  promise = new Promise(resolve => {
    const allHydrated = () => {
      try {
        return stores.every(s => s.persist.hasHydrated());
      } catch {
        return false;
      }
    };
    const finish = () => { resolved = true; resolve(); };
    if (allHydrated()) { finish(); return; }
    const unsubs = stores.map(s => s.persist.onFinishHydration(finish));
    const fallback = setTimeout(() => { unsubs.forEach(u => u()); finish(); }, 4000);
    // safety net for stores that never start hydration
    setTimeout(() => { unsubs.forEach(u => u()); clearTimeout(fallback); finish(); }, 8000);
  });
  return promise;
};
