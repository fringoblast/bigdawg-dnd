import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RollResult } from '@/types/message';
import { idbStorage } from '@/lib/storage';

interface RollState {
  history: RollResult[];
  add: (r: RollResult) => void;
  clear: () => void;
}

const MAX = 50;

export const useRollStore = create<RollState>()(
  persist(
    (set, get) => ({
      history: [],
      add: (r) => set({ history: [r, ...get().history].slice(0, MAX) }),
      clear: () => set({ history: [] })
    }),
    {
      name: 'bd-rolls',
      storage: createJSONStorage(() => idbStorage),
      version: 1
    }
  )
);
