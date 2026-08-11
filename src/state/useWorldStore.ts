import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { World, Story } from '@/types/world';
import { uid, idbStorage } from '@/lib/storage';

export interface WorldStoreState {
  worlds: World[];
  stories: Story[];
  activeWorldId: string | null;
  activeStoryId: string | null;
  createWorld: (w: Omit<World, 'id'>) => string;
  updateWorld: (id: string, patch: Partial<World>) => void;
  removeWorld: (id: string) => void;
  createStory: (s: Omit<Story, 'id'>) => string;
  updateStory: (id: string, patch: Partial<Story>) => void;
  removeStory: (id: string) => void;
  setActiveWorld: (id: string | null) => void;
  setActiveStory: (id: string | null) => void;
  activeWorld: () => World | null;
  activeStory: () => Story | null;
  import: (worlds: World[], stories: Story[], activeWorldId: string | null, activeStoryId: string | null) => void;
  export: () => { worlds: World[]; stories: Story[]; activeWorldId: string | null; activeStoryId: string | null };
}

export const useWorldStore = create<WorldStoreState>()(
  persist(
    (set, get) => ({
      worlds: [],
      stories: [],
      activeWorldId: null,
      activeStoryId: null,
      createWorld: (w) => {
        const id = uid();
        set(state => ({ worlds: [...state.worlds, { ...w, id }], activeWorldId: id }));
        return id;
      },
      updateWorld: (id, patch) => set(state => ({
        worlds: state.worlds.map(w => w.id === id ? { ...w, ...patch } : w)
      })),
      removeWorld: (id) => set(state => ({
        worlds: state.worlds.filter(w => w.id !== id),
        activeWorldId: state.activeWorldId === id ? null : state.activeWorldId
      })),
      createStory: (s) => {
        const id = uid();
        set(state => ({ stories: [...state.stories, { ...s, id }], activeStoryId: id }));
        return id;
      },
      updateStory: (id, patch) => set(state => ({
        stories: state.stories.map(s => s.id === id ? { ...s, ...patch } : s)
      })),
      removeStory: (id) => set(state => ({
        stories: state.stories.filter(s => s.id !== id),
        activeStoryId: state.activeStoryId === id ? null : state.activeStoryId
      })),
      setActiveWorld: (id) => set({ activeWorldId: id }),
      setActiveStory: (id) => set({ activeStoryId: id }),
      activeWorld: () => {
        const s = get();
        return s.worlds.find(w => w.id === s.activeWorldId) || null;
      },
      activeStory: () => {
        const s = get();
        return s.stories.find(x => x.id === s.activeStoryId) || null;
      },
      import: (worlds, stories, activeWorldId, activeStoryId) => set({ worlds, stories, activeWorldId, activeStoryId }),
      export: () => ({
        worlds: get().worlds,
        stories: get().stories,
        activeWorldId: get().activeWorldId,
        activeStoryId: get().activeStoryId
      })
    }),
    { name: 'bd-world', storage: createJSONStorage(() => idbStorage), version: 1 }
  )
);
