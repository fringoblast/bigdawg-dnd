import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useChatStore } from '@/state/useChatStore';
import { useUIStore } from '@/state/useUIStore';
import { PROVIDERS, PROVIDER_IDS, pickProvider, defaultModelFor, detectProviderByKey } from '@/lib/providers/registry';
import type { ProviderId, ModelInfo } from '@/lib/providers/types';
import { setSoundEnabled } from '@/lib/audio';
import { storage, clearAllData } from '@/lib/storage';
import { motion, AnimatePresence } from 'framer-motion';
import SavePointsSheet from '@/components/save/SavePointsSheet';
import CustomApiModal from '@/components/settings/CustomApiModal';
import { isCustomProviderId, shouldUseProxy, type CustomProviderConfig } from '@/lib/providers/custom';

type ProviderScope = 'main' | 'chat';

export default function SettingsModal() {
  const close = useUIStore(s => s.closeSettings);
  const {
    apiKey, model, theme, soundOn, provider,
    appMode, chatProvider, chatModel,
    aiPortraits, aiBackgrounds, ambientMusic
  } = useSettingsStore();
  const setApiKey = useSettingsStore(s => s.setApiKey);
  const setModel = useSettingsStore(s => s.setModel);
  const setTheme = useSettingsStore(s => s.setTheme);
  const setSound = useSettingsStore(s => s.setSound);
  const setProvider = useSettingsStore(s => s.setProvider);
  const setAppMode = useSettingsStore(s => s.setAppMode);
  const setChatProvider = useSettingsStore(s => s.setChatProvider);
  const setChatModel = useSettingsStore(s => s.setChatModel);
  const setAiPortraits = useSettingsStore(s => s.setAiPortraits);
  const setAiBackgrounds = useSettingsStore(s => s.setAiBackgrounds);
  const setAmbientMusic = useSettingsStore(s => s.setAmbientMusic);
  const customProviders = useSettingsStore(s => s.customProviders);
  const setCustomProviders = useSettingsStore(s => s.setCustomProviders);
  const removeCustomProvider = useSettingsStore(s => s.removeCustomProvider);
  const [savesOpen, setSavesOpen] = useState(false);
  const [customApiOpen, setCustomApiOpen] = useState(false);
  const [editingCustom, setEditingCustom] = useState<CustomProviderConfig | null>(null);
  const characters = useCharacterStore(s => s.characters);
  const charExport = useCharacterStore(s => s.export);
  const charImport = useCharacterStore(s => s.import);
  const worlds = useWorldStore(s => s.worlds);
  const stories = useWorldStore(s => s.stories);
  const worldExport = useWorldStore(s => s.export);
  const worldImport = useWorldStore(s => s.import);
  const chatExport = useChatStore(s => s.export);
  const chatImport = useChatStore(s => s.import);
  const fetchModels = useChatStore(s => s.fetchModels);
  const modelsByProvider = useChatStore(s => s.modelsByProvider);
  const showToast = useUIStore(s => s.showToast);

  const [scope, setScope] = useState<ProviderScope>('main');
  const [keyInput, setKeyInput] = useState(apiKey);
  const [keyValid, setKeyValid] = useState<null | boolean>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [usage, setUsage] = useState({ used: 0, total: 5 * 1024 * 1024, pct: 0 });
  const [testing, setTesting] = useState(false);

  useEffect(() => { storage.estimateUsage().then(setUsage); }, []);
  useEffect(() => { setKeyInput(apiKey); }, [apiKey]);

  useEffect(() => {
    const auto = detectProviderByKey(keyInput);
    if (auto && scope === 'main' && auto !== provider) {
      setProvider(auto);
    }
  }, [keyInput, scope, provider, setProvider]);

  useEffect(() => {
    const effectiveProvider = scope === 'main' ? provider : chatProvider;
    if (!effectiveProvider) return;
    const customCfg = customProviders.find(c => c.id === effectiveProvider);
    const meta = PROVIDERS[effectiveProvider];
    const providerNeedsKey = customCfg ? false : meta ? meta.requiresKey : true;
    const cache = modelsByProvider[effectiveProvider];
    if (cache && cache.list.length === 0 && !cache.loading) {
      // Tombstone gate: a failing endpoint backs off for 60s instead of looping forever.
      if (cache.failedAt && Date.now() - cache.failedAt < 60_000) return;
      if (!providerNeedsKey || apiKey) {
        fetchModels(effectiveProvider, customCfg ? customCfg.apiKey : apiKey || '').catch(() => {});
      }
    }
  }, [apiKey, scope, provider, chatProvider, modelsByProvider, fetchModels, customProviders]);

  const activeProvider: ProviderId = scope === 'main' ? provider : chatProvider;
  const activeModel: string = scope === 'main' ? model : chatModel;
  const activeCustom = customProviders.find(c => c.id === activeProvider);
  const currentMeta = activeCustom
    ? {
        label: activeCustom.label,
        badge: activeCustom.type === 'anthropic' ? 'Anthropic' : 'OpenAI',
        keyPrefix: '',
        keyPlaceholder: 'Key stored with this custom API',
        keyHint: '',
        defaultModel: '(pick one below)',
        requiresKey: false,
        capabilities: { streaming: true, toolCalls: true, vision: activeCustom.type !== 'anthropic' },
        modelListNote: undefined as string | undefined
      }
    : PROVIDERS[activeProvider];
  const currentModels: ModelInfo[] = modelsByProvider[activeProvider]?.list || [];
  const modelsLoading = modelsByProvider[activeProvider]?.loading;
  const needsKey = activeCustom ? false : currentMeta.requiresKey;

  const onTestKey = async () => {
    if (needsKey && !keyInput.trim()) return;
    setTesting(true);
    setKeyValid(null);
    try {
      const res = await pickProvider(activeProvider, customProviders).testKey(needsKey ? keyInput.trim() : '');
      setKeyValid(res.ok);
      if (res.ok) {
        if (needsKey) setApiKey(keyInput.trim());
        if (needsKey) fetchModels(activeProvider, keyInput.trim(), true);
        showToast(`${currentMeta.label} key valid${res.latencyMs ? ` · ${res.latencyMs}ms` : ''}${needsKey ? '' : ' · no key required'}`, 'success');
      } else {
        showToast(`${currentMeta.label} key rejected: ${res.error || 'unknown'}`, 'error');
      }
    } catch (e: any) {
      setKeyValid(false);
      showToast(`Test failed: ${e?.message || 'unknown'}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const onSwitchProvider = (id: ProviderId) => {
    if (id === activeProvider) return;
    const customCfg = customProviders.find(c => c.id === id);
    if (scope === 'main') setProvider(id);
    else setChatProvider(id);
    setKeyValid(null);
    setModelSearch('');
    showToast(`Provider: ${customCfg ? customCfg.label : PROVIDERS[id].label}`, 'info');
    // Custom providers: fetch models immediately (they carry their own key) and
    // auto-pick the first model if none is remembered. setModelFor targets the
    // *clicked* id explicitly, so a quick double-switch can't cross-write slots.
    if (customCfg) {
      fetchModels(id, customCfg.apiKey, true).then(() => {
        const list = useChatStore.getState().modelsByProvider[id]?.list || [];
        if (list.length && !useSettingsStore.getState().modelByProvider[id]) {
          useSettingsStore.getState().setModelFor(id, list[0].id, scope === 'chat');
        }
      });
    }
  };

  const onPickModel = (m: string) => {
    if (scope === 'main') setModel(m);
    else setChatModel(m);
    showToast(`Model: ${m}`, 'info');
  };

  const filtered = currentModels
    .filter(m => !modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name?.toLowerCase().includes(modelSearch.toLowerCase()))
    .sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  const doExport = () => {
    const data = {
      version: 3,
      exportedAt: new Date().toISOString(),
      settings: { provider, model, theme, soundOn, appMode, chatProvider, chatModel, customProviders },
      characters: charExport(),
      worlds: worldExport(),
      chats: chatExport()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bigdawg-dnd-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Export downloaded', 'success');
  };

  const onImport = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(String(r.result));
        if (data.characters) charImport(data.characters.characters, data.characters.activeId);
        if (data.worlds) worldImport(data.worlds.worlds, data.worlds.stories, data.worlds.activeWorldId, data.worlds.activeStoryId);
        if (data.chats) chatImport(data.chats);
        if (data.settings?.provider && PROVIDER_IDS.includes(data.settings.provider)) setProvider(data.settings.provider);
        if (data.settings?.model) setModel(data.settings.model);
        if (data.settings?.theme) setTheme(data.settings.theme);
        if (typeof data.settings?.soundOn === 'boolean') setSound(data.settings.soundOn);
        if (data.settings?.appMode === 'chat' || data.settings?.appMode === 'dnd') setAppMode(data.settings.appMode);
        if (data.settings?.chatProvider && PROVIDER_IDS.includes(data.settings.chatProvider)) setChatProvider(data.settings.chatProvider);
        if (data.settings?.chatModel) setChatModel(data.settings.chatModel);
        if (Array.isArray(data.settings?.customProviders)) {
          setCustomProviders(data.settings.customProviders);
          // Restore provider/model selection for custom ids too (not just built-ins).
          if (data.settings.customProviders.length) {
            const customIds = new Set(data.settings.customProviders.map((c: any) => c.id));
            if (data.settings?.provider && customIds.has(data.settings.provider)) setProvider(data.settings.provider);
            if (data.settings?.model && data.settings?.provider) useSettingsStore.getState().setModelFor(data.settings.provider, data.settings.model, false);
            if (data.settings?.chatProvider && customIds.has(data.settings.chatProvider)) setChatProvider(data.settings.chatProvider);
            if (data.settings?.chatModel && data.settings?.chatProvider) useSettingsStore.getState().setModelFor(data.settings.chatProvider, data.settings.chatModel, true);
          }
        }
        showToast('Save imported', 'success');
      } catch (e) {
        showToast('Import failed: bad file', 'error');
      }
    };
    r.readAsText(file);
  };

  const onReset = async () => {
    if (!confirm('Wipe ALL data including characters, worlds, and chat history?')) return;
    if (!confirm('Really sure? This cannot be undone.')) return;
    await clearAllData();
    location.reload();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={close}
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
          className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto m-0 sm:m-3 rounded-t-2xl sm:rounded-2xl"
          style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 p-4 flex items-center justify-between" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>Settings</div>
            <button onClick={close} className="text-2xl leading-none">×</button>
          </div>

          <div className="p-4 space-y-4">
            <section>
              <div className="label mb-2">App mode</div>
              <div className="grid grid-cols-2 gap-1">
                {(['dnd', 'chat'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setAppMode(m); showToast(`Mode: ${m === 'dnd' ? 'D&D Adventure' : 'Standalone Chat'}`, 'info'); }}
                    className="text-left p-3 rounded-lg border"
                    style={{ background: appMode === m ? 'rgba(212,175,55,0.12)' : 'var(--surface-2)', borderColor: appMode === m ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{m === 'dnd' ? 'D&D Adventure' : 'Standalone Chat'}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: appMode === m ? 'var(--accent)' : 'var(--surface)', color: appMode === m ? '#1a1a1a' : 'var(--text-muted)' }}>{m === 'dnd' ? 'Hero · NPCs · Dice' : 'Clean AI chat'}</span>
                    </div>
                    <div className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                      {m === 'dnd'
                        ? 'Full character sheets, dice, world, AI DM narration.'
                        : 'Standalone chat. Zero D&D state. Different provider OK.'}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="grid grid-cols-2 gap-1 mb-2">
                <button
                  onClick={() => setScope('main')}
                  className="text-xs py-1.5 rounded font-semibold"
                  style={{ background: scope === 'main' ? 'var(--accent)' : 'var(--surface-2)', color: scope === 'main' ? '#1a1a1a' : 'var(--text)' }}
                >D&D provider</button>
                <button
                  onClick={() => setScope('chat')}
                  className="text-xs py-1.5 rounded font-semibold"
                  style={{ background: scope === 'chat' ? 'var(--accent)' : 'var(--surface-2)', color: scope === 'chat' ? '#1a1a1a' : 'var(--text)' }}
                >Chat provider</button>
              </div>

              <div className="label mb-2">AI provider</div>
              <div className="grid grid-cols-2 gap-1">
                {PROVIDER_IDS.map(id => {
                  const meta = PROVIDERS[id];
                  const active = id === activeProvider;
                  return (
                    <button
                      key={id}
                      onClick={() => onSwitchProvider(id)}
                      className="text-left p-3 rounded-lg border"
                      style={{ background: active ? 'rgba(212,175,55,0.12)' : 'var(--surface-2)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{meta.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#1a1a1a' : 'var(--text-muted)' }}>{meta.badge}</span>
                      </div>
                      <div className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{meta.description}</div>
                      {!meta.requiresKey && (
                        <div className="text-[10px] mt-1" style={{ color: 'var(--accent)' }}>◆ no key required</div>
                      )}
                    </button>
                  );
                })}
                {customProviders.map(cfg => {
                  const active = cfg.id === activeProvider;
                  return (
                    <button
                      key={cfg.id}
                      onClick={() => onSwitchProvider(cfg.id)}
                      className="text-left p-3 rounded-lg border"
                      style={{ background: active ? 'rgba(212,175,55,0.12)' : 'var(--surface-2)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm truncate">{cfg.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#1a1a1a' : 'var(--text-muted)' }}>{cfg.type === 'anthropic' ? 'Anthropic' : 'Custom'}</span>
                      </div>
                      <div className="text-[10px] mt-1 leading-snug truncate" style={{ color: 'var(--text-muted)' }}>{cfg.baseUrl.replace(/^https?:\/\//, '')}</div>
                      <div className="text-[10px] mt-1" style={{ color: 'var(--accent)' }}>◆ custom API · key on device</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="label mb-2">{currentMeta.label} API key</div>
              {activeCustom ? (
                <div className="card text-xs" style={{ background: 'rgba(212,175,55,0.08)' }}>
                  <div style={{ color: 'var(--accent)' }}>◆ Key stored with this custom API.</div>
                  <div className="mt-1" style={{ color: 'var(--text-muted)' }}>
                    Requests go straight to {activeCustom.baseUrl}. Manage the key in Custom APIs below.
                  </div>
                  <button onClick={onTestKey} className="btn btn-ghost text-xs mt-2" disabled={testing}>
                    {testing ? '…' : 'Test connection'}
                  </button>
                </div>
              ) : needsKey ? (
                <>
                  <div className="flex gap-1">
                    <input
                      type="password"
                      value={keyInput}
                      onChange={e => { setKeyInput(e.target.value); setKeyValid(null); }}
                      placeholder={currentMeta.keyPlaceholder}
                      className="font-mono text-sm"
                      autoComplete="off"
                    />
                    <button onClick={onTestKey} className="btn btn-ghost text-xs shrink-0" disabled={testing || !keyInput.trim()}>
                      {testing ? '…' : 'Test'}
                    </button>
                  </div>
                  {keyValid === true && <p className="text-[11px] mt-1" style={{ color: 'var(--accent)' }}>✓ valid</p>}
                  {keyValid === false && <p className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>✗ rejected</p>}
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{currentMeta.keyHint}</p>
                </>
              ) : (
                <div className="card text-xs" style={{ background: 'rgba(212,175,55,0.08)' }}>
                  <div style={{ color: 'var(--accent)' }}>◆ {currentMeta.label} is keyless — totally anonymous.</div>
                  <div className="mt-1" style={{ color: 'var(--text-muted)' }}>No signup, no key stored. Requests go straight to the public endpoint.</div>
                  <button onClick={onTestKey} className="btn btn-ghost text-xs mt-2" disabled={testing}>
                    {testing ? '…' : 'Test reachability'}
                  </button>
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="label">Model</div>
                <button onClick={() => fetchModels(activeProvider, activeCustom ? activeCustom.apiKey : apiKey, true)} className="text-[10px] underline" style={{ color: 'var(--accent)' }} disabled={modelsLoading}>
                  {modelsLoading ? 'Loading…' : '↻ Refresh'}
                </button>
              </div>
              <input placeholder="Search models…" value={modelSearch} onChange={e => setModelSearch(e.target.value)} className="text-sm mb-2" />
              <div className="max-h-48 overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                {modelsLoading && <div className="p-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>Loading models from {currentMeta.label}…</div>}
                {!modelsLoading && filtered.length === 0 && modelsByProvider[activeProvider]?.lastError && (
                  <div className="p-3 text-xs" style={{ color: 'var(--danger)' }}>
                    <div className="font-semibold mb-1">/models failed: {modelsByProvider[activeProvider]!.lastError}</div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      Check the base URL ({activeCustom ? `${activeCustom.baseUrl}/models` : 'server-status'}) and key. Tap Refresh to retry (auto-retries in 60s).
                      {activeCustom && !shouldUseProxy(activeCustom) && ' If the API blocks browsers (CORS), enable "Route through proxy" when editing this provider.'}
                    </div>
                  </div>
                )}
                {!modelsLoading && filtered.length === 0 && !modelsByProvider[activeProvider]?.lastError && (
                  <div className="p-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                    {activeCustom
                      ? 'No models. Tap Refresh.'
                      : needsKey
                        ? (apiKey ? 'No models. Tap Refresh.' : `Add ${currentMeta.label} API key.`)
                        : currentMeta.modelListNote || 'Loading model list…'}
                  </div>
                )}
                {filtered.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onPickModel(m.id)}
                    className="w-full text-left px-3 py-2 text-xs flex items-center justify-between border-b last:border-0"
                    style={{ borderColor: 'var(--border)', background: activeModel === m.id ? 'rgba(212,175,55,0.12)' : 'transparent' }}
                  >
                    <span className="truncate flex-1">{m.name || m.id}</span>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {m.contextLength && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{(m.contextLength / 1000).toFixed(0)}k</span>}
                      {m.isFree && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>FREE</span>}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Default: <span className="font-mono">{currentMeta.defaultModel}</span>
              </p>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="label">Custom APIs</div>
                <button
                  onClick={() => { setEditingCustom(null); setCustomApiOpen(true); }}
                  className="btn btn-ghost text-xs"
                >＋ Add custom API</button>
              </div>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                Bring your own endpoint — OpenAI-compatible (OpenAI, DeepSeek, LM Studio, Ollama…) or Anthropic. Each keeps its own key and gets listed in the provider picker above.
              </p>
              {customProviders.length === 0 ? (
                <div className="card text-xs py-3 text-center" style={{ color: 'var(--text-muted)' }}>No custom APIs yet.</div>
              ) : (
                <div className="space-y-1">
                  {customProviders.map(cfg => (
                    <div
                      key={cfg.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border"
                      style={{ background: 'var(--surface-2)', borderColor: cfg.id === activeProvider ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs truncate">{cfg.label}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded shrink-0" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>{cfg.type === 'anthropic' ? 'Anthropic' : 'OpenAI'}</span>
                          {cfg.id === activeProvider && <span className="text-[9px] px-1 py-0.5 rounded shrink-0" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>ACTIVE</span>}
                        </div>
                        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{cfg.baseUrl}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingCustom(cfg); setCustomApiOpen(true); }}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'var(--surface)', color: 'var(--text)' }}
                        >Edit</button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${cfg.label}"?`)) {
                              removeCustomProvider(cfg.id);
                              showToast('Custom API removed', 'info');
                            }
                          }}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'var(--surface)', color: 'var(--danger)' }}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="label mb-2">Theme</div>
              <div className="grid grid-cols-3 gap-1">
                {(['system','dark','light'] as const).map(t => (
                  <button key={t} onClick={() => setTheme(t)} className="py-2 rounded-lg text-sm font-semibold capitalize" style={{ background: theme === t ? 'var(--accent)' : 'var(--surface-2)', color: theme === t ? '#1a1a1a' : 'var(--text)' }}>{t}</button>
                ))}
              </div>
            </section>

            <section>
              <div className="label mb-2">Sound</div>
              <button onClick={() => { setSound(!soundOn); setSoundEnabled(!soundOn); }} className="w-full flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                <span>Dice rolls &amp; UI sounds</span>
                <span className="font-mono text-sm" style={{ color: soundOn ? 'var(--accent)' : 'var(--text-muted)' }}>{soundOn ? 'ON' : 'OFF'}</span>
              </button>
            </section>

            <section>
              <div className="label mb-2">AI features &amp; ambient</div>
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                All free, all anonymous via Pollinations + procedural Web Audio. Toggle any off — it stops immediately.
              </p>
              <Toggle
                label="Character portraits (AI)"
                desc="Generate avatars during character creation."
                on={aiPortraits}
                onToggle={() => setAiPortraits(!aiPortraits)}
              />
              <Toggle
                label="Scene backgrounds (AI)"
                desc="Subtle backdrop behind chat bubbles. Toggle off if it bothers you."
                on={aiBackgrounds}
                onToggle={() => setAiBackgrounds(!aiBackgrounds)}
              />
              <Toggle
                label="Ambient music"
                desc="Mood-aware procedural drone — only in the Story tab."
                on={ambientMusic}
                onToggle={() => setAmbientMusic(!ambientMusic)}
              />
              {!soundOn && ambientMusic && (
                <p className="text-[10px] mt-1.5" style={{ color: 'var(--danger)' }}>
                  Sound is OFF — ambient music needs Sound ON to be heard.
                </p>
              )}
            </section>

            <section>
              <div className="label mb-2">Save data</div>
              <div className="space-y-2">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Storage: {(usage.used / 1024).toFixed(0)} KB / {(usage.total / 1024).toFixed(0)} KB ({Math.round(usage.pct * 100)}%)
                </div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, usage.pct * 100)}%`, background: usage.pct > 0.8 ? 'var(--danger)' : 'var(--accent)' }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setSavesOpen(true)} className="btn btn-primary text-sm">🗄️ Save points</button>
                  <button onClick={doExport} className="btn btn-ghost text-sm">⬇ Export JSON</button>
                </div>
                <label className="btn btn-ghost text-sm w-full cursor-pointer block text-center">
                  ⬆ Import JSON
                  <input type="file" accept="application/json" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
                </label>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{characters.length} characters · {worlds.length} worlds · {stories.length} stories</div>
              </div>
            </section>

            <section>
              <button onClick={onReset} className="btn btn-danger w-full text-sm">Reset all data</button>
            </section>

            <section className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <div>BigDawg D&D v0.6</div>
              <div className="mt-1">5e SRD · Built for adventure.</div>
            </section>
          </div>
        </motion.div>
      </motion.div>
      <SavePointsSheet open={savesOpen} onClose={() => setSavesOpen(false)} />
      <CustomApiModal open={customApiOpen} onClose={() => setCustomApiOpen(false)} editing={editingCustom} />
    </AnimatePresence>
  );
}

const Toggle = ({ label, desc, on, onToggle }: { label: string; desc: string; on: boolean; onToggle: () => void }) => (
  <button
    onClick={onToggle}
    className="w-full flex items-center justify-between p-3 rounded-lg mb-1.5 text-left"
    style={{ background: 'var(--surface-2)', border: '1px solid ' + (on ? 'rgba(212,175,55,0.4)' : 'var(--border)') }}
  >
    <div className="flex-1 pr-3 min-w-0">
      <div className="font-semibold text-sm" style={{ color: on ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
      {desc && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>}
    </div>
    <div className="text-[10px] font-mono font-bold w-9 h-5 rounded-full flex items-center justify-center" style={{ background: on ? 'var(--accent)' : 'var(--surface-3)', color: on ? '#1a1a1a' : 'var(--text-muted)' }}>
      {on ? 'ON' : 'OFF'}
    </div>
  </button>
);
