import { uid } from './storage';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useSessionStore } from '@/state/useSessionStore';
import { useChatStore } from '@/state/useChatStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useNPCStore } from '@/state/useNPCStore';
import { useRollStore } from '@/state/useRollStore';
import { useSettingsStore } from '@/state/useSettingsStore';

export const SNAPSHOT_VERSION = 1;

export interface SnapshotMeta {
  id: string;
  label: string;
  characterId: string | null;
  characterName: string | null;
  sessionId: string | null;
  sessionName: string | null;
  messageCount: number;
  savedAt: number;
  indexKey: string; // camelCase stable key for IndexedDB row
}

export interface Snapshot {
  version: number;
  id: string;
  label: string;
  savedAt: number;
  characterId: string | null;
  sessionId: string | null;
  data: {
    settings: any;
    characters: { characters: any[]; activeId: string | null };
    sessions: { sessions: any[]; activeSessionId: string | null; activeSessionIdByMode: any };
    chat: { messagesBySession: any; summaryBySession: any };
    world: { worlds: any[]; stories: any[]; activeWorldId: string | null; activeStoryId: string | null };
    npcs: { npcs: any[] };
    rolls: { history: any[] };
  };
}

const DB_NAME = 'bigdawg-saves';
const DB_VERSION = 1;
const META_STORE = 'meta';
const BLOB_STORE = 'snapshots'; // stores stringified JSON blobs

const openDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB not available'));
    return;
  }
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(META_STORE)) {
      db.createObjectStore(META_STORE, { keyPath: 'indexKey' });
    }
    if (!db.objectStoreNames.contains(BLOB_STORE)) {
      db.createObjectStore(BLOB_STORE, { keyPath: 'id' });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const tx = async <T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T): Promise<T> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result: T;
    const p = fn(t);
    if (p instanceof Promise) {
      p.then(r => { result = r; }).catch(reject);
    } else {
      result = p;
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};

const putMeta = (m: SnapshotMeta) => tx([META_STORE], 'readwrite', t => new Promise<void>((resolve, reject) => {
  const r = t.objectStore(META_STORE).put(m);
  r.onsuccess = () => resolve();
  r.onerror = () => reject(r.error);
}));

const allMeta = (): Promise<SnapshotMeta[]> => tx([META_STORE], 'readonly', t => new Promise((resolve, reject) => {
  const r = t.objectStore(META_STORE).getAll();
  r.onsuccess = () => resolve((r.result as SnapshotMeta[]).sort((a, b) => b.savedAt - a.savedAt));
  r.onerror = () => reject(r.error);
}));

const putSnapshot = (snap: Snapshot) => tx([BLOB_STORE], 'readwrite', t => new Promise<void>((resolve, reject) => {
  const r = t.objectStore(BLOB_STORE).put(snap);
  r.onsuccess = () => resolve();
  r.onerror = () => reject(r.error);
}));

const getSnapshot = (id: string): Promise<Snapshot | undefined> => tx([BLOB_STORE], 'readonly', t => new Promise((resolve, reject) => {
  const r = t.objectStore(BLOB_STORE).get(id);
  r.onsuccess = () => resolve(r.result as Snapshot | undefined);
  r.onerror = () => reject(r.error);
}));

const delSnapshot = (id: string) => Promise.all([
  tx([BLOB_STORE], 'readwrite', t => new Promise<void>((resolve, reject) => {
    const r = t.objectStore(BLOB_STORE).delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  })),
  tx([META_STORE], 'readwrite', t => new Promise<void>((resolve, reject) => {
    const r = t.objectStore(META_STORE).delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  }))
]).then(() => undefined);

export interface BuildSnapshotOptions {
  label?: string;
  id?: string;
  characterId?: string | null;
}

/** Build a full app snapshot from the live zustand stores. */
export const buildSnapshot = (opts: BuildSnapshotOptions = {}): Snapshot => {
  const charStore = useCharacterStore.getState();
  const sessionStore = useSessionStore.getState();
  const chatStore = useChatStore.getState();
  const worldStore = useWorldStore.getState();
  const npcStore = useNPCStore.getState();
  const rollStore = useRollStore.getState();
  const settings = useSettingsStore.getState();

  const activeChar = charStore.characters.find(c => c.id === charStore.activeId) || null;
  const activeSession = sessionStore.sessions.find(s => s.id === sessionStore.activeSessionId) || null;
  const msgs = activeSession ? (chatStore.messagesBySession[activeSession.id] || []) : [];

  const id = opts.id || uid();
  const savedAt = Date.now();
  return {
    version: SNAPSHOT_VERSION,
    id,
    label: (opts.label || '').trim().slice(0, 80) || `Save · ${new Date(savedAt).toLocaleString()}`,
    savedAt,
    characterId: opts.characterId ?? activeChar?.id ?? null,
    sessionId: activeSession?.id ?? null,
    data: {
      settings: {
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        modelByProvider: settings.modelByProvider,
        theme: settings.theme,
        soundOn: settings.soundOn,
        onboarded: settings.onboarded,
        appMode: settings.appMode,
        chatProvider: settings.chatProvider,
        chatModel: settings.chatModel,
        aiPortraits: settings.aiPortraits,
        aiBackgrounds: settings.aiBackgrounds,
        ambientMusic: settings.ambientMusic
      },
      characters: { characters: charStore.characters, activeId: charStore.activeId },
      sessions: {
        sessions: sessionStore.sessions,
        activeSessionId: sessionStore.activeSessionId,
        activeSessionIdByMode: sessionStore.activeSessionIdByMode
      },
      chat: { messagesBySession: chatStore.messagesBySession, summaryBySession: chatStore.summaryBySession },
      world: { worlds: worldStore.worlds, stories: worldStore.stories, activeWorldId: worldStore.activeWorldId, activeStoryId: worldStore.activeStoryId },
      npcs: { npcs: npcStore.npcs },
      rolls: { history: rollStore.history }
    }
  };
};

export interface SaveResult { meta: SnapshotMeta; snapshot: Snapshot; }

/** Persist a snapshot to IndexedDB (overwrites if `id` matches an existing slot). */
export const saveSnapshot = async (opts: BuildSnapshotOptions = {}): Promise<SaveResult> => {
  const snap = buildSnapshot(opts);
  const activeChar = snap.data.characters.characters.find(c => c.id === snap.data.characters.activeId) || null;
  const activeSession = snap.data.sessions.sessions.find(s => s.id === snap.data.sessions.activeSessionId) || null;
  const messageCount = activeSession ? Object.values(snap.data.chat.messagesBySession).reduce((sum: number, m: any) => sum + (Array.isArray(m) ? m.length : 0), 0) : 0;
  const meta: SnapshotMeta = {
    id: snap.id,
    label: snap.label,
    characterId: snap.characterId,
    characterName: activeChar?.name || null,
    sessionId: snap.sessionId,
    sessionName: activeSession?.name || null,
    messageCount,
    savedAt: snap.savedAt,
    indexKey: snap.id
  };
  await putMeta(meta);
  await putSnapshot(snap);
  return { meta, snapshot: snap };
};

/** List all saves (metadata only — does not pull the heavy JSON blobs). */
export const listSnapshots = async (): Promise<SnapshotMeta[]> => allMeta();

/** Restore a snapshot into the live stores. */
export const restoreSnapshot = async (id: string): Promise<Snapshot | null> => {
  const snap = await getSnapshot(id);
  if (!snap) return null;
  applySnapshot(snap);
  return snap;
};

export const deleteSnapshot = async (id: string): Promise<void> => {
  await delSnapshot(id);
};

/** Apply a snapshot to the live stores. Pure side-effect — no migration shim yet; future versions get a switch. */
export const applySnapshot = (snap: Snapshot): void => {
  // Settings apply first so downstream stores (which read appMode/etc from settings) see the right value.
  const s = useSettingsStore.getState();
  const d = snap.data;
  if (d.settings) {
    useSettingsStore.setState({
      provider: d.settings.provider ?? s.provider,
      apiKey: d.settings.apiKey ?? s.apiKey,
      model: d.settings.model ?? s.model,
      modelByProvider: d.settings.modelByProvider ?? s.modelByProvider,
      theme: d.settings.theme ?? s.theme,
      soundOn: typeof d.settings.soundOn === 'boolean' ? d.settings.soundOn : s.soundOn,
      onboarded: typeof d.settings.onboarded === 'boolean' ? d.settings.onboarded : s.onboarded,
      appMode: d.settings.appMode ?? s.appMode,
      chatProvider: d.settings.chatProvider ?? s.chatProvider,
      chatModel: d.settings.chatModel ?? s.chatModel,
      aiPortraits: typeof d.settings.aiPortraits === 'boolean' ? d.settings.aiPortraits : s.aiPortraits,
      aiBackgrounds: typeof d.settings.aiBackgrounds === 'boolean' ? d.settings.aiBackgrounds : s.aiBackgrounds,
      ambientMusic: typeof d.settings.ambientMusic === 'boolean' ? d.settings.ambientMusic : s.ambientMusic
    } as any);
  }
  if (d.characters) useCharacterStore.setState({ characters: d.characters.characters, activeId: d.characters.activeId });
  if (d.sessions) useSessionStore.setState({
    sessions: d.sessions.sessions,
    activeSessionId: d.sessions.activeSessionId,
    activeSessionIdByMode: d.sessions.activeSessionIdByMode ?? { dnd: null, chat: null }
  } as any);
  if (d.chat) useChatStore.setState({ messagesBySession: d.chat.messagesBySession, summaryBySession: d.chat.summaryBySession } as any);
  if (d.world) useWorldStore.setState({
    worlds: d.world.worlds,
    stories: d.world.stories,
    activeWorldId: d.world.activeWorldId,
    activeStoryId: d.world.activeStoryId
  } as any);
  if (d.npcs) useNPCStore.setState({ npcs: d.npcs.npcs } as any);
  if (d.rolls) useRollStore.setState({ history: d.rolls.history } as any);
};
