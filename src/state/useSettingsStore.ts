import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ProviderId } from '@/lib/providers/types';
import type { CustomProviderConfig } from '@/lib/providers/custom';
import { PROVIDERS, defaultModelFor, detectProviderByKey } from '@/lib/providers/registry';
import { idbStorage } from '@/lib/storage';

export type Theme = 'system' | 'dark' | 'light';
export type AppMode = 'dnd' | 'chat';

interface SettingsState {
  provider: ProviderId;
  apiKey: string;
  model: string;
  modelByProvider: Record<ProviderId, string>;
  theme: Theme;
  soundOn: boolean;
  onboarded: boolean;
  appMode: AppMode;
  chatProvider: ProviderId;
  chatModel: string;
  /** Toggle: AI-generated character portraits in CharacterCreator. Free via Pollinations. Default ON. */
  aiPortraits: boolean;
  /** Toggle: AI-generated scene art backdrop behind chat bubbles in StoryTab. Free via Pollinations. Default OFF (large downloads + modest wow). */
  aiBackgrounds: boolean;
  /** Toggle: procedural ambient drone in story tab. Free (pure Web Audio). Default OFF. */
  ambientMusic: boolean;
  /** User-defined API providers (OpenAI-compatible or Anthropic) with their own base URL + key. */
  customProviders: CustomProviderConfig[];
  setProvider: (id: ProviderId) => void;
  setApiKey: (k: string) => void;
  setModel: (m: string) => void;
  setTheme: (t: Theme) => void;
  setSound: (on: boolean) => void;
  setOnboarded: (v: boolean) => void;
  setAppMode: (m: AppMode) => void;
  setChatProvider: (id: ProviderId) => void;
  setChatModel: (m: string) => void;
  setModelFor: (providerId: string, m: string, forChat?: boolean) => void;
  setAiPortraits: (on: boolean) => void;
  setAiBackgrounds: (on: boolean) => void;
  setAmbientMusic: (on: boolean) => void;
  addCustomProvider: (cfg: CustomProviderConfig) => void;
  updateCustomProvider: (id: string, patch: Partial<CustomProviderConfig>) => void;
  removeCustomProvider: (id: string) => void;
  setCustomProviders: (list: CustomProviderConfig[]) => void;
  reset: () => void;
}

const initialProvider: ProviderId = 'openrouter';
const allDefaults = () => ({
  openrouter: PROVIDERS.openrouter.defaultModel,
  groq: PROVIDERS.groq.defaultModel,
  cerebras: PROVIDERS.cerebras.defaultModel,
  nim: PROVIDERS.nim.defaultModel,
  pollinations: PROVIDERS.pollinations.defaultModel
});

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      provider: initialProvider,
      apiKey: '',
      model: PROVIDERS[initialProvider].defaultModel,
      modelByProvider: allDefaults(),
      theme: 'dark',
      soundOn: true,
      onboarded: false,
      appMode: 'dnd',
      // Standalone chat mode uses its own provider so users can keep OpenRouter/Groq for D&D and switch to Pollinations for chat (or whatever they prefer).
      chatProvider: 'pollinations',
      chatModel: PROVIDERS.pollinations.defaultModel,
      // v0.6 AI + ambient toggles. Portraits default ON (great UX in CharacterCreator),
      // backgrounds + ambient default OFF so users opt into the heavier features explicitly.
      aiPortraits: true,
      aiBackgrounds: false,
      ambientMusic: false,
      customProviders: [],
      setProvider: (id) => {
        const stored = get().modelByProvider?.[id];
        set({
          provider: id,
          model: stored || defaultModelFor(id)
        });
      },
      setApiKey: (k) => {
        const trimmed = k.trim();
        const detected = detectProviderByKey(trimmed);
        if (detected) {
          const stored = get().modelByProvider?.[detected];
          set({
            apiKey: trimmed,
            provider: detected,
            model: stored || defaultModelFor(detected)
          });
        } else {
          set({ apiKey: trimmed });
        }
      },
      setModel: (m) => {
        const provider = get().provider;
        set({
          model: m,
          modelByProvider: { ...get().modelByProvider, [provider]: m }
        });
      },
      setTheme: (t) => set({ theme: t }),
      setSound: (on) => set({ soundOn: on }),
      setOnboarded: (v) => set({ onboarded: v }),
      setAppMode: (m) => set({ appMode: m }),
      setChatProvider: (id) => {
        const stored = get().modelByProvider?.[id];
        set({
          chatProvider: id,
          chatModel: stored || defaultModelFor(id)
        });
      },
      setChatModel: (m) => {
        const provider = get().chatProvider;
        set({
          chatModel: m,
          modelByProvider: { ...get().modelByProvider, [provider]: m }
        });
      },
      /** Race-safe: writes the model into an EXPLICIT provider slot (only updating the live
       *  selection when that provider is still active). Used after async model-list fetches. */
      setModelFor: (providerId, m, forChat = false) => {
        set(state => ({
          modelByProvider: { ...state.modelByProvider, [providerId]: m },
          ...(forChat
            ? (state.chatProvider === providerId ? { chatModel: m } : {})
            : (state.provider === providerId ? { model: m } : {}))
        }));
      },
      setAiPortraits: (on) => set({ aiPortraits: on }),
      setAiBackgrounds: (on) => set({ aiBackgrounds: on }),
      setAmbientMusic: (on) => set({ ambientMusic: on }),
      addCustomProvider: (cfg) => set(s => ({ customProviders: [...s.customProviders, cfg] })),
      updateCustomProvider: (id, patch) => set(s => ({
        customProviders: s.customProviders.map(c => c.id === id ? { ...c, ...patch } : c)
      })),
      removeCustomProvider: (id) => set(s => {
        const modelByProvider = { ...s.modelByProvider };
        delete modelByProvider[id];
        return {
          customProviders: s.customProviders.filter(c => c.id !== id),
          modelByProvider,
          provider: s.provider === id ? 'openrouter' : s.provider,
          model: s.provider === id ? (modelByProvider.openrouter || defaultModelFor('openrouter')) : s.model,
          chatProvider: s.chatProvider === id ? 'pollinations' : s.chatProvider,
          chatModel: s.chatProvider === id ? (modelByProvider.pollinations || defaultModelFor('pollinations')) : s.chatModel
        };
      }),
      setCustomProviders: (list) => set({ customProviders: list }),
      reset: () => set({
        provider: initialProvider,
        apiKey: '',
        model: PROVIDERS[initialProvider].defaultModel,
        modelByProvider: allDefaults(),
        theme: 'dark',
        soundOn: true,
        onboarded: false,
        appMode: 'dnd',
        chatProvider: 'pollinations',
        chatModel: PROVIDERS.pollinations.defaultModel,
        aiPortraits: true,
        aiBackgrounds: false,
        ambientMusic: false,
        customProviders: []
      })
    }),
    {
      name: 'bd-settings',
      storage: createJSONStorage(() => idbStorage),
      version: 5,
      migrate: (persisted: any, fromVersion: number) => {
        if (!persisted) return persisted;
        let r = persisted;
        // v2 → v3: ensure new provider keys + appMode + chatProvider/chatModel exist.
        if (fromVersion < 3) {
          const prevProvider: ProviderId = r.provider || 'openrouter';
          const prevModel: string = r.model || PROVIDERS[prevProvider].defaultModel;
          r = {
            ...r,
            provider: prevProvider,
            model: prevModel,
            modelByProvider: {
              openrouter: prevProvider === 'openrouter' ? prevModel : PROVIDERS.openrouter.defaultModel,
              groq: prevProvider === 'groq' ? prevModel : PROVIDERS.groq.defaultModel,
              cerebras: prevProvider === 'cerebras' ? prevModel : PROVIDERS.cerebras.defaultModel,
              nim: prevProvider === 'nim' ? prevModel : PROVIDERS.nim.defaultModel,
              pollinations: prevProvider === 'pollinations' ? prevModel : PROVIDERS.pollinations.defaultModel
            },
            appMode: r.appMode || 'dnd',
            chatProvider: r.chatProvider || 'pollinations',
            chatModel: r.chatModel || PROVIDERS.pollinations.defaultModel
          };
        }
        // v3 → v4: add the three AI / ambient toggles (defaults: portraits ON, others OFF).
        if (fromVersion < 4) {
          r = {
            ...r,
            aiPortraits: typeof r.aiPortraits === 'boolean' ? r.aiPortraits : true,
            aiBackgrounds: typeof r.aiBackgrounds === 'boolean' ? r.aiBackgrounds : false,
            ambientMusic: typeof r.ambientMusic === 'boolean' ? r.ambientMusic : false
          };
        }
        // v4 → v5: add the custom API providers list (default empty).
        if (fromVersion < 5) {
          r = {
            ...r,
            customProviders: Array.isArray(r.customProviders) ? r.customProviders : []
          };
        }
        return r;
      }
    }
  )
);
