import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Session, AppMode } from '@/types/session';
import { uid, idbStorage } from '@/lib/storage';
import { useSettingsStore } from '@/state/useSettingsStore';

// Sentinel characterId for chat-mode sessions (no real character attached).
export const CHAT_MODE_CHAR = '__chat__';

export interface CreateSessionInput {
  name: string;
  characterId: string;
  worldId?: string | null;
  storyId?: string | null;
  mode?: AppMode;
}

interface SessionState {
  sessions: Session[];
  /** Legacy global active session id. Kept for backward-compat reads; new code should prefer `activeSessionIdByMode`. */
  activeSessionId: string | null;
  /** Per-mode active session id. Chat and D&D each keep their own active thread so switching modes never bleeds messages. */
  activeSessionIdByMode: Record<AppMode, string | null>;
  create: (init: CreateSessionInput) => string;
  update: (id: string, patch: Partial<Session>) => void;
  remove: (id: string) => void;
  /** Smart setter: infers the session's mode and updates both the global id and the per-mode slot. Use `setActiveForMode` if you want to be explicit. */
  setActive: (id: string | null) => void;
  /** Explicit per-mode setter. */
  setActiveForMode: (mode: AppMode, id: string | null) => void;
  bumpMessageCount: (id: string) => void;
  rename: (id: string, name: string) => void;
  archive: (id: string, archived: boolean) => void;
  forCharacter: (characterId: string) => Session[];
  forMode: (mode: AppMode) => Session[];
  get: (id: string) => Session | undefined;
  active: () => Session | null;
  import: (sessions: Session[], activeSessionId: string | null) => void;
  export: () => { sessions: Session[]; activeSessionId: string | null };
}

const touch = (s: Session): Session => ({ ...s, updatedAt: Date.now() });

const modeOf = (s: Session | undefined, fallback: AppMode = 'dnd'): AppMode =>
  (s?.mode === 'chat' ? 'chat' : fallback);

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      activeSessionIdByMode: { dnd: null, chat: null },
      create: ({ name, characterId, worldId = null, storyId = null, mode = 'dnd' }) => {
        const id = uid();
        const session: Session = {
          id, name: (name || '').trim() || (mode === 'chat' ? 'New chat' : 'New Adventure'),
          characterId,
          worldId,
          storyId,
          mode,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messageCount: 0
        };
        set(state => ({
          sessions: [...state.sessions, session],
          activeSessionId: id,
          activeSessionIdByMode: { ...state.activeSessionIdByMode, [mode]: id }
        }));
        return id;
      },
      update: (id, patch) => set(state => ({
        sessions: state.sessions.map(s => s.id === id ? touch({ ...s, ...patch }) : s)
      })),
      remove: (id) => set(state => {
        const remaining = state.sessions.filter(s => s.id !== id);
        const removed = state.sessions.find(s => s.id === id);
        const removedMode = modeOf(removed);
        const nextActive = state.activeSessionId === id ? (remaining[0]?.id || null) : state.activeSessionId;
        return {
          sessions: remaining,
          activeSessionId: nextActive,
          activeSessionIdByMode: {
            ...state.activeSessionIdByMode,
            [removedMode]: state.activeSessionIdByMode[removedMode] === id
              ? (remaining.find(s => modeOf(s) === removedMode)?.id || null)
              : state.activeSessionIdByMode[removedMode]
          }
        };
      }),
      setActive: (id) => set(state => {
        if (id === null) {
          // Clear the global id and both per-mode slots so legacy `setActive(null)` callers
          // don't leave a stale id in any slot.
          return {
            activeSessionId: null,
            activeSessionIdByMode: { dnd: null, chat: null }
          };
        }
        const s = state.sessions.find(x => x.id === id);
        const mode = modeOf(s);
        return {
          activeSessionId: id,
          activeSessionIdByMode: { ...state.activeSessionIdByMode, [mode]: id }
        };
      }),
      setActiveForMode: (mode, id) => set(state => {
        // Don't clobber the global id when null is passed — only update the per-mode slot.
        // The global id is best-effort and should match whichever mode is currently active.
        const appMode = currentAppMode();
        const nextGlobal = id !== null
          ? id
          : (appMode === mode ? null : state.activeSessionId);
        return {
          activeSessionId: nextGlobal,
          activeSessionIdByMode: { ...state.activeSessionIdByMode, [mode]: id }
        };
      }),
      bumpMessageCount: (id) => set(state => ({
        sessions: state.sessions.map(s => s.id === id ? { ...s, messageCount: s.messageCount + 1, updatedAt: Date.now() } : s)
      })),
      rename: (id, name) => set(state => ({
        sessions: state.sessions.map(s => s.id === id ? { ...s, name: (name || '').trim() || s.name, updatedAt: Date.now() } : s)
      })),
      archive: (id, archived) => set(state => ({
        sessions: state.sessions.map(s => s.id === id ? { ...s, archived, updatedAt: Date.now() } : s)
      })),
      forCharacter: (characterId) => get().sessions.filter(s => s.characterId === characterId).sort((a, b) => b.updatedAt - a.updatedAt),
      forMode: (mode) => get().sessions.filter(s => modeOf(s) === mode).sort((a, b) => b.updatedAt - a.updatedAt),
      get: (id) => get().sessions.find(s => s.id === id),
      active: () => {
        const s = get();
        return s.sessions.find(x => x.id === s.activeSessionId) || null;
      },
      import: (sessions, activeSessionId) => set({ sessions, activeSessionId }),
      export: () => ({ sessions: get().sessions, activeSessionId: get().activeSessionId })
    }),
    {
      name: 'bd-session',
      storage: createJSONStorage(() => idbStorage),
      version: 3,
      migrate: (persisted: any, fromVersion: number) => {
        if (!persisted) return persisted;
        let result = persisted;
        // v1 → v2: ensure every session carries a `mode` flag (default 'dnd').
        if (fromVersion < 2) {
          result = {
            ...result,
            sessions: (result.sessions || []).map((s: Session) => ({ ...s, mode: s.mode || 'dnd' }))
          };
        }
        // v2 → v3: seed the per-mode active session id from the legacy global id.
        if (fromVersion < 3) {
          const legacyActive: string | null = result.activeSessionId || null;
          const legacySession = legacyActive
            ? (result.sessions || []).find((s: Session) => s.id === legacyActive)
            : undefined;
          const legacyMode: AppMode = legacySession?.mode === 'chat' ? 'chat' : 'dnd';
          result = {
            ...result,
            activeSessionIdByMode: {
              dnd: legacyMode === 'dnd' ? legacyActive : null,
              chat: legacyMode === 'chat' ? legacyActive : null
            }
          };
        }
        return result;
      },
      partialize: (s) => ({
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        activeSessionIdByMode: s.activeSessionIdByMode
      })
    }
  )
);

// Reads the current app mode from the settings store. Used by `setActiveForMode` to decide
// whether a `null` id should also clear the global `activeSessionId` (only if the current
// mode matches). Safe because `useSettingsStore` doesn't import `useSessionStore`.
const currentAppMode = (): AppMode => useSettingsStore.getState().appMode;
