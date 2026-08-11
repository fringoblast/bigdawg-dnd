import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Message, ChatSummary, AIDiceRoll, StateDelta } from '@/types/message';
import { uid, idbStorage } from '@/lib/storage';
import { pickProvider } from '@/lib/providers/registry';
import type { ProviderId, ModelInfo, ChatTool, ChatRequest } from '@/lib/providers/types';
import { STATE_DELTA_TOOL, extractStateDelta, toolCallToDelta, mergeDeltas, isEmptyDelta } from '@/lib/stateParser';
import { rollExpression } from '@/lib/diceEngine';
import { useNPCStore } from './useNPCStore';
import { useSessionStore } from './useSessionStore';
import { useSettingsStore } from './useSettingsStore';
import { useCharacterStore } from './useCharacterStore';

// Matches bracketed dice like [1d20], [2d6+3], [4d6kh3], [1d20-1] inside DM prose.
const AI_DICE_RE = /\[(\d*d\d+(?:[+-]\d+)?(?:kh\d+)?(?:kl\d+)?)\]/gi;

const rollEmbeddedDice = (text: string): { text: string; rolls: AIDiceRoll[] } => {
  if (!text) return { text, rolls: [] };
  const rolls: AIDiceRoll[] = [];
  const replaced = text.replace(AI_DICE_RE, (full, expr) => {
    try {
      const r = rollExpression(String(expr).toLowerCase(), 'AI');
      rolls.push({ expression: String(expr), result: r, at: rolls.length });
      return `[${expr}=${r.total}]`;
    } catch {
      return full;
    }
  });
  return { text: replaced, rolls };
};

export { rollEmbeddedDice };


interface ProviderCache {
  list: ModelInfo[];
  fetchedAt: number;
  loading: boolean;
  /** Set when the last /models attempt failed. Prevents Settings effect from hammering a dead endpoint. */
  lastError?: string;
  failedAt?: number;
}

const FETCH_FAIL_BACKOFF_MS = 60_000;

interface ChatState {
  messagesBySession: Record<string, Message[]>;
  summaryBySession: Record<string, ChatSummary>;
  modelsByProvider: Record<ProviderId, ProviderCache>;
  streaming: Record<string, boolean>;
  abortControllers: Record<string, AbortController | null>;
  _legacyMessagesByChar?: Record<string, Message[]>;
  _legacySummaryByChar?: Record<string, ChatSummary>;
  add: (sessionId: string, m: Omit<Message, 'id' | 'ts'>) => string;
  update: (sessionId: string, id: string, patch: Partial<Message>) => void;
  remove: (sessionId: string, id: string) => void;
  clear: (sessionId: string) => void;
  setMessages: (sessionId: string, ms: Message[]) => void;
  setSummary: (sessionId: string, s: ChatSummary) => void;
  send: (
    sessionId: string,
    apiKey: string,
    provider: ProviderId,
    model: string,
    payload: { system: string; recent: { role: 'user' | 'assistant' | 'system'; content: string }[] },
    onError: (e: string) => void
  ) => Promise<{ text: string; toolCalls?: any[]; delta?: StateDelta | null } | null>;
  stop: (sessionId: string) => void;
  fetchModels: (provider: ProviderId, key: string, force?: boolean) => Promise<void>;
  import: (data: { messagesBySession: Record<string, Message[]>; summaryBySession: Record<string, ChatSummary> }) => void;
  export: () => { messagesBySession: Record<string, Message[]>; summaryBySession: Record<string, ChatSummary> };
}

const migrate = (legacy: Record<string, Message[]>): { messagesBySession: Record<string, Message[]>; sessionMap: Record<string, string> } => {
  const messagesBySession: Record<string, Message[]> = {};
  const sessionMap: Record<string, string> = {};
  Object.entries(legacy).forEach(([characterId, msgs]) => {
    const sessionId = 'migrated-' + characterId;
    messagesBySession[sessionId] = msgs;
    sessionMap[characterId] = sessionId;
  });
  return { messagesBySession, sessionMap };
};

const ensureSessionsForLegacy = () => {
  const state = useChatStore.getState();
  if (!state._legacyMessagesByChar) return;
  const sessionStore = useSessionStore.getState();
  const charactersWithLegacy = Object.keys(state._legacyMessagesByChar);
  if (charactersWithLegacy.length === 0) return;
  const existingSessionIds = new Set(sessionStore.sessions.map(s => s.id));
  charactersWithLegacy.forEach(characterId => {
    const sessionId = 'migrated-' + characterId;
    if (!existingSessionIds.has(sessionId)) {
      const charMessages = state._legacyMessagesByChar![characterId] || [];
      const firstTs = charMessages[0]?.ts || Date.now();
      const lastTs = charMessages[charMessages.length - 1]?.ts || Date.now();
      const session = {
        id: sessionId,
        name: 'Saved Adventure',
        characterId,
        worldId: null,
        storyId: null,
        createdAt: firstTs,
        updatedAt: lastTs,
        messageCount: charMessages.length
      };
      useSessionStore.setState(s => ({ sessions: [...s.sessions, session] }));
    }
  });
  setTimeout(() => {
    useChatStore.setState({ _legacyMessagesByChar: undefined, _legacySummaryByChar: undefined });
  }, 100);
};

const EMPTY_CACHE: ProviderCache = { list: [], fetchedAt: 0, loading: false };

const errorMessage = (provider: ProviderId, status?: number, fallback?: string): string => {
  if (status === 429) return 'The DM is resting. Rate limit hit — try again in a few minutes.';
  if (status === 401) return 'Your API key was rejected. Tap the gear to update it.';
  if (status === 404 || status === 400) return 'The model is unavailable. Pick another in Settings.';
  if (status === 413) return 'Prompt too long. Try clearing old messages.';
  return `Connection lost (${provider}): ${fallback || 'unknown error'}`;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesBySession: {},
      summaryBySession: {},
      modelsByProvider: {
        openrouter: { ...EMPTY_CACHE },
        groq: { ...EMPTY_CACHE },
        cerebras: { ...EMPTY_CACHE },
        nim: { ...EMPTY_CACHE },
        pollinations: { ...EMPTY_CACHE }
      },
      streaming: {},
      abortControllers: {},
      _legacyMessagesByChar: undefined,
      _legacySummaryByChar: undefined,
      add: (sessionId, m) => {
        const id = uid();
        set(state => {
          const cur = state.messagesBySession[sessionId] || [];
          return { messagesBySession: { ...state.messagesBySession, [sessionId]: [...cur, { ...m, id, ts: Date.now() }] } };
        });
        useSessionStore.getState().bumpMessageCount(sessionId);
        return id;
      },
      update: (sessionId, id, patch) => set(state => {
        const cur = state.messagesBySession[sessionId] || [];
        return { messagesBySession: { ...state.messagesBySession, [sessionId]: cur.map(m => m.id === id ? { ...m, ...patch } : m) } };
      }),
      remove: (sessionId, id) => set(state => {
        const cur = state.messagesBySession[sessionId] || [];
        return { messagesBySession: { ...state.messagesBySession, [sessionId]: cur.filter(m => m.id !== id) } };
      }),
      clear: (sessionId) => set(state => {
        const next = { ...state.messagesBySession };
        delete next[sessionId];
        return { messagesBySession: next };
      }),
      setMessages: (sessionId, ms) => set(state => ({ messagesBySession: { ...state.messagesBySession, [sessionId]: ms } })),
      setSummary: (sessionId, s) => set(state => ({ summaryBySession: { ...state.summaryBySession, [sessionId]: s } })),
      send: async (sessionId, apiKey, provider, model, payload, onError) => {
        // Guard: an empty model (e.g. a custom provider whose list hasn't fetched yet)
        // must never be sent — it 404s and the stream would strand the delta forever.
        if (!model || !model.trim()) {
          const placeholderId = get().add(sessionId, { role: 'dm', text: '', pending: false });
          const msg = 'Pick a model for this provider in Settings first.';
          get().update(sessionId, placeholderId, { text: msg, pending: false, error: true });
          onError(msg);
          return Promise.resolve(null);
        }
        const ctrl = new AbortController();
        set(state => ({ abortControllers: { ...state.abortControllers, [sessionId]: ctrl }, streaming: { ...state.streaming, [sessionId]: true } }));

        const placeholderId = get().add(sessionId, { role: 'dm', text: '', pending: true });

        const tools: ChatTool[] = [STATE_DELTA_TOOL as any];
        const chatReq: ChatRequest = {
          model,
          messages: [{ role: 'system', content: payload.system }, ...payload.recent],
          tools,
          tool_choice: 'auto',
          temperature: 0.8,
          max_tokens: 900
        };

        const p = pickProvider(provider, useSettingsStore.getState().customProviders);

        return await new Promise<{ text: string; toolCalls?: any[]; delta?: StateDelta | null } | null>(resolve => {
          let full = '';
          let toolCallsAcc: { id: string; type: 'function'; function: { name: string; arguments: string } }[] | undefined;
          let aborted = false;
          let errored = false;

          const finalize = (rawFull: string) => {
              // Shared path: strip leaked JSON/STATE blocks, roll inline dice, persist.
              const { cleaned, delta } = extractStateDelta(rawFull);
              let fallbackDelta = delta;
              if (!fallbackDelta && toolCallsAcc?.length) {
                // Merge ALL update_character_state calls (some models emit more than one per turn).
                for (const t of toolCallsAcc) {
                  if (t.function?.name !== 'update_character_state') continue;
                  const each = toolCallToDelta(t.function.arguments);
                  if (each && !fallbackDelta) fallbackDelta = each;
                  else if (each && fallbackDelta) fallbackDelta = mergeDeltas(fallbackDelta, each);
                }
              }
              const { text: withDiceResults, rolls: aiDiceRolls } = rollEmbeddedDice(cleaned || rawFull);
              // Use cleaned text always when we could strip; fall back to raw only if the
              // stripper returned empty AND there was no delta to silently swallow.
              const finalText = aiDiceRolls.length ? withDiceResults : (cleaned.trim() ? cleaned : (fallbackDelta ? '' : rawFull));
              get().update(sessionId, placeholderId, {
                text: finalText,
                pending: false,
                stateDelta: fallbackDelta || undefined,
                aiRolls: aiDiceRolls.length ? aiDiceRolls : undefined
              });
              return { finalText, fallbackDelta, aiDiceRolls };
            };

            (async () => {
            try {
              for await (const chunk of p.chatStream(chatReq, apiKey, ctrl.signal)) {
                if (aborted || errored) return;
                if (chunk.type === 'content' && chunk.content) {
                  full += chunk.content;
                  get().update(sessionId, placeholderId, { text: (get().messagesBySession[sessionId]?.find(m => m.id === placeholderId)?.text || '') + chunk.content });
                } else if (chunk.type === 'tool_calls' && chunk.toolCalls?.length) {
                  if (!toolCallsAcc) toolCallsAcc = [];
                  for (const tc of chunk.toolCalls) {
                    const idx = tc.index ?? 0;
                    let bucket = toolCallsAcc[idx];
                    if (!bucket) {
                      bucket = { id: tc.id || '', type: 'function', function: { name: tc.function?.name || '', arguments: '' } };
                      toolCallsAcc[idx] = bucket;
                    }
                    if (tc.id) bucket.id = tc.id;
                    if (tc.function?.name) bucket.function.name = tc.function.name;
                    if (tc.function?.arguments) bucket.function.arguments += tc.function.arguments;
                  }
                } else if (chunk.type === 'error') {
                  errored = true;
                  const e = chunk.error || { message: 'Unknown error' };
                  const msg = errorMessage(provider, e.status, e.message);
                  get().update(sessionId, placeholderId, { text: msg, pending: false, error: true });
                  set(state => ({ streaming: { ...state.streaming, [sessionId]: false }, abortControllers: { ...state.abortControllers, [sessionId]: null } }));
                  onError(msg);
                  resolve(null);
                  return;
                }
              }
              if (errored) return;
              // If the user pressed Stop mid-stream, still finalize what we have and apply
              // any state the DM already emitted — no more stranded `pending` bubbles or lost HP.
              const { finalText, fallbackDelta } = finalize(full);
              if (aborted && !finalText.trim()) {
                // Nothing arrived at all — drop the zombie placeholder entirely.
                get().remove(sessionId, placeholderId);
                set(state => ({ streaming: { ...state.streaming, [sessionId]: false }, abortControllers: { ...state.abortControllers, [sessionId]: null } }));
                resolve(null);
                return;
              }
              // --- Apply character state: INSIDE the store now (no "last message" lookup) ---
              if (fallbackDelta) {
                const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
                const characterId = session?.characterId;
                if (characterId) {
                  const applyDelta = useCharacterStore.getState().applyDelta;
                  applyDelta(characterId, fallbackDelta);
                }
                if (fallbackDelta.npcsIntroduced?.length) {
                  const preview = finalText.slice(0, 240);
                  const characterId = session?.characterId || '';
                  for (const intro of fallbackDelta.npcsIntroduced) {
                    useNPCStore.getState().introduce(intro, { sessionId, characterId, messagePreview: preview });
                  }
                }
              }
              set(state => ({ streaming: { ...state.streaming, [sessionId]: false }, abortControllers: { ...state.abortControllers, [sessionId]: null } }));
              resolve({ text: finalText, toolCalls: toolCallsAcc, delta: fallbackDelta });
            } catch (e: any) {
              if (e?.name === 'AbortError') {
                // Same finalize path as a user Stop — just finish quietly, no toast.
                const { finalText, fallbackDelta } = finalize(full);
                if (!finalText.trim()) get().remove(sessionId, placeholderId);
                if (fallbackDelta) {
                  const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
                  if (session?.characterId) useCharacterStore.getState().applyDelta(session.characterId, fallbackDelta);
                  if (fallbackDelta.npcsIntroduced?.length) {
                    const preview = finalText.slice(0, 240);
                    const characterId = session?.characterId || '';
                    for (const intro of fallbackDelta.npcsIntroduced) {
                      useNPCStore.getState().introduce(intro, { sessionId, characterId, messagePreview: preview });
                    }
                  }
                }
                set(state => ({ streaming: { ...state.streaming, [sessionId]: false }, abortControllers: { ...state.abortControllers, [sessionId]: null } }));
                resolve({ text: finalText, toolCalls: toolCallsAcc, delta: fallbackDelta });
                return;
              }
              const msg = errorMessage(provider, undefined, e?.message);
              get().update(sessionId, placeholderId, { text: msg, pending: false, error: true });
              set(state => ({ streaming: { ...state.streaming, [sessionId]: false }, abortControllers: { ...state.abortControllers, [sessionId]: null } }));
              onError(msg);
              resolve(null);
            }
          })();

          // expose abort to caller
          const originalAbort = ctrl.abort.bind(ctrl);
          (ctrl as any).abort = () => { aborted = true; originalAbort(); };
        });
      },
      stop: (sessionId) => {
        const ctrl = get().abortControllers[sessionId];
        if (ctrl) ctrl.abort();
        set(state => ({ streaming: { ...state.streaming, [sessionId]: false }, abortControllers: { ...state.abortControllers, [sessionId]: null } }));
      },
      fetchModels: async (provider, key, force = false) => {
        const cur = get().modelsByProvider[provider] || EMPTY_CACHE;
        if (cur.loading) return;
        if (!force && cur.list.length && Date.now() - cur.fetchedAt < 1000 * 60 * 60 * 24) return;
        // Tombstone: don't hammer a dead endpoint — auto-retries wait out the backoff window.
        if (!force && cur.failedAt && Date.now() - cur.failedAt < FETCH_FAIL_BACKOFF_MS) return;
        set(state => ({ modelsByProvider: { ...state.modelsByProvider, [provider]: { ...cur, loading: true } } }));
        try {
          const list = await pickProvider(provider, useSettingsStore.getState().customProviders).listModels(key);
          set(state => ({
            modelsByProvider: { ...state.modelsByProvider, [provider]: { list, fetchedAt: Date.now(), loading: false, lastError: undefined, failedAt: undefined } }
          }));
        } catch (e: any) {
          const msg = e?.status ? `${e.status} — ${e?.message || 'Request failed'}` : (e?.message || 'Request failed');
          set(state => ({ modelsByProvider: { ...state.modelsByProvider, [provider]: { ...cur, loading: false, lastError: msg, failedAt: Date.now() } } }));
        }
      },
      import: (data) => set({ messagesBySession: data.messagesBySession, summaryBySession: data.summaryBySession }),
      export: () => ({ messagesBySession: get().messagesBySession, summaryBySession: get().summaryBySession })
    }),
    {
      name: 'bd-chat',
      storage: createJSONStorage(() => idbStorage),
      version: 2,
      migrate: (persisted: any, fromVersion: number) => {
        if (fromVersion < 2 && persisted) {
          const { messagesByChar, summaryByChar } = persisted;
          if (messagesByChar) {
            const { messagesBySession } = migrate(messagesByChar);
            return {
              ...persisted,
              messagesBySession,
              summaryBySession: summaryByChar || {},
              _legacyMessagesByChar: messagesByChar,
              _legacySummaryByChar: summaryByChar
            };
          }
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        if (state?._legacyMessagesByChar) {
          setTimeout(() => ensureSessionsForLegacy(), 50);
        }
      },
      partialize: (s) => ({
        messagesBySession: s.messagesBySession,
        summaryBySession: s.summaryBySession,
        _legacyMessagesByChar: s._legacyMessagesByChar,
        _legacySummaryByChar: s._legacySummaryByChar
      })
    }
  )
);
