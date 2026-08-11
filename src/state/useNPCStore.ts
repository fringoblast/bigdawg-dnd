import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NPC, NPCBackup } from '@/types/npc';
import type { NPCIntro } from '@/types/message';
import { uid, idbStorage } from '@/lib/storage';

interface NPCState {
  npcs: NPC[];
  backups: NPCBackup[];
  introduce: (intro: NPCIntro, ctx: { sessionId: string; characterId: string; messagePreview?: string }) => NPC | null;
  update: (id: string, patch: Partial<NPC>) => void;
  remove: (id: string) => void;
  setStatus: (id: string, status: NPC['status']) => void;
  addBackup: (npcId: string) => void;
  removeBackup: (id: string) => void;
  import: (npcs: NPC[], backups: NPCBackup[]) => void;
  export: () => { npcs: NPC[]; backups: NPCBackup[] };
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

export const useNPCStore = create<NPCState>()(
  persist(
    (set, get) => ({
      npcs: [],
      backups: [],
      introduce: (intro, ctx) => {
        if (!intro?.name || !intro?.role) return null;
        const target = normalize(intro.name);
        const existing = get().npcs.find(n => normalize(n.name) === target);
        if (existing) {
          set(state => ({
            npcs: state.npcs.map(n => n.id === existing.id ? { ...n, messagePreview: ctx.messagePreview || n.messagePreview, updatedAt: Date.now() } : n)
          }));
          return existing;
        }
        const npc: NPC = {
          id: uid(),
          name: intro.name,
          role: intro.role,
          description: intro.description || '',
          disposition: intro.disposition || 'unknown',
          race: intro.race,
          location: intro.location,
          firstSeenAt: Date.now(),
          sessionId: ctx.sessionId,
          characterId: ctx.characterId,
          messagePreview: ctx.messagePreview,
          status: 'alive',
          updatedAt: Date.now()
        };
        set(state => ({ npcs: [...state.npcs, npc] }));
        return npc;
      },
      update: (id, patch) => set(state => ({
        npcs: state.npcs.map(n => n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)
      })),
      remove: (id) => set(state => ({ npcs: state.npcs.filter(n => n.id !== id) })),
      setStatus: (id, status) => set(state => ({
        npcs: state.npcs.map(n => n.id === id ? { ...n, status, updatedAt: Date.now() } : n)
      })),
      addBackup: (npcId) => {
        const npc = get().npcs.find(n => n.id === npcId);
        if (!npc) return;
        const data: Omit<NPC, 'id' | 'updatedAt'> = {
          name: npc.name, role: npc.role, description: npc.description, disposition: npc.disposition,
          race: npc.race, location: npc.location, firstSeenAt: npc.firstSeenAt,
          sessionId: npc.sessionId, characterId: npc.characterId,
          messagePreview: npc.messagePreview, notes: npc.notes, status: npc.status
        };
        const backup: NPCBackup = { id: uid(), name: npc.name, data, createdAt: Date.now() };
        set(state => ({ backups: [backup, ...state.backups].slice(0, 100) }));
      },
      removeBackup: (id) => set(state => ({ backups: state.backups.filter(b => b.id !== id) })),
      import: (npcs, backups) => set({ npcs, backups }),
      export: () => ({ npcs: get().npcs, backups: get().backups })
    }),
    { name: 'bd-npc', storage: createJSONStorage(() => idbStorage), version: 1 }
  )
);
