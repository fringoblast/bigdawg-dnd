import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useUIStore } from '@/state/useUIStore';
import { makeCustomProvider, shouldUseProxy, type CustomProviderConfig, type CustomProviderType } from '@/lib/providers/custom';
import { uid } from '@/lib/storage';

const TYPE_PRESETS: Record<CustomProviderType, { label: string; urlPlaceholder: string; urlHint: string; defaultLabel: string }> = {
  openai: {
    label: 'OpenAI-compatible',
    urlPlaceholder: 'https://api.openai.com/v1',
    urlHint: 'Any OpenAI-compatible endpoint — OpenAI, DeepSeek, LM Studio (http://localhost:1234/v1), Ollama, custom gateways. Keep /v1 if the server uses it.',
    defaultLabel: 'OpenAI-compatible'
  },
  anthropic: {
    label: 'Anthropic',
    urlPlaceholder: 'https://api.anthropic.com',
    urlHint: 'Do not add /v1 — it is appended automatically. Works with Anthropic and Anthropic-compatible endpoints.',
    defaultLabel: 'Anthropic'
  }
};

export default function CustomApiModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: CustomProviderConfig | null }) {
  const addCustomProvider = useSettingsStore(s => s.addCustomProvider);
  const updateCustomProvider = useSettingsStore(s => s.updateCustomProvider);
  const removeCustomProvider = useSettingsStore(s => s.removeCustomProvider);
  const showToast = useUIStore(s => s.showToast);

  const [type, setType] = useState<CustomProviderType>('openai');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [useProxy, setUseProxy] = useState(true);

  useEffect(() => {
    if (open) {
      setType(editing?.type || 'openai');
      setLabel(editing?.label || '');
      setBaseUrl(editing?.baseUrl || '');
      setApiKey(editing?.apiKey || '');
      setUseProxy(editing?.useProxy ?? shouldUseProxy({ useProxy: undefined, baseUrl: editing?.baseUrl || '' }));
    }
  }, [open, editing]);

  const preset = TYPE_PRESETS[type];

  const effectiveLabel = label.trim() || preset.defaultLabel;

  const onTest = async () => {
    if (!baseUrl.trim()) { showToast('Enter a base URL first', 'warn'); return; }
    setTesting(true);
    try {
      const draft: CustomProviderConfig = {
        id: editing?.id || 'custom-draft',
        type, label: effectiveLabel, baseUrl, apiKey: apiKey.trim(), createdAt: editing?.createdAt || Date.now(), useProxy
      };
      const res = await makeCustomProvider(draft).testKey(apiKey.trim());
      showToast(res.ok
        ? `${effectiveLabel} OK${res.latencyMs ? ` · ${res.latencyMs}ms` : ''}`
        : `${effectiveLabel} failed: ${res.error || 'unknown'}`, res.ok ? 'success' : 'error');
    } catch (e: any) {
      showToast(`Test failed: ${e?.message || 'unknown'}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const onSave = () => {
    if (!baseUrl.trim()) { showToast('Enter a base URL', 'warn'); return; }
    try { new URL(baseUrl.trim()); } catch { showToast('That URL looks invalid (need http:// or https://)', 'warn'); return; }
    const cfg: CustomProviderConfig = {
      id: editing?.id || 'custom-' + uid(),
      type, label: effectiveLabel, baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), createdAt: editing?.createdAt || Date.now(), useProxy
    };
    if (editing) {
      updateCustomProvider(cfg.id, { type, label: effectiveLabel, baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), useProxy });
      showToast(`${effectiveLabel} updated`, 'success');
    } else {
      addCustomProvider(cfg);
      showToast(`${effectiveLabel} added — pick it in Settings`, 'success');
    }
    onClose();
  };

  const onDelete = () => {
    if (!editing) return;
    if (!confirm(`Remove "${editing.label}"?`)) return;
    removeCustomProvider(editing.id);
    showToast('Custom API removed', 'info');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto m-0 sm:m-3 rounded-t-2xl sm:rounded-2xl"
            style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 p-4 flex items-center justify-between" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>
                {editing ? 'Edit custom API' : 'Add custom API'}
              </div>
              <button onClick={onClose} className="text-2xl leading-none">×</button>
            </div>

            <div className="p-4 space-y-4">
              <section>
                <div className="label mb-2">API type</div>
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(TYPE_PRESETS) as CustomProviderType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className="py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: type === t ? 'var(--accent)' : 'var(--surface-2)', color: type === t ? '#1a1a1a' : 'var(--text)' }}
                    >{TYPE_PRESETS[t].label}</button>
                  ))}
                </div>
              </section>

              <section>
                <div className="label mb-2">Base URL</div>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder={preset.urlPlaceholder}
                  className="font-mono text-sm"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{preset.urlHint}</p>
              </section>

              <section>
                <div className="label mb-2">Label</div>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder={preset.defaultLabel}
                  className="text-sm"
                  autoComplete="off"
                />
              </section>

              <section>
                <div className="label mb-2">API key</div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Paste key… (empty OK for local servers)"
                  className="font-mono text-sm"
                  autoComplete="off"
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {type === 'anthropic'
                    ? 'Stored on your device only. Required for Anthropic.'
                    : 'Stored on your device only. Local servers (LM Studio, Ollama) usually accept empty.'}
                </p>
              </section>

              <section>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold">Route through Netlify proxy</div>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      Fixes APIs that block browsers (CORS) — e.g. opencode.ai/zen. Auto-enabled for https remote
                      URLs. Turn off only for local servers (LM Studio, Ollama).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={useProxy}
                    onChange={e => setUseProxy(e.target.checked)}
                    className="w-5 h-5 shrink-0 accent-[var(--accent)]"
                  />
                </label>
              </section>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={onTest} className="btn btn-ghost text-sm" disabled={testing || !baseUrl.trim()}>
                  {testing ? 'Testing…' : 'Test connection'}
                </button>
                <button onClick={onSave} className="btn btn-primary text-sm" disabled={!baseUrl.trim()}>
                  {editing ? 'Save changes' : 'Save'}
                </button>
              </div>

              {editing && (
                <button onClick={onDelete} className="btn btn-danger w-full text-sm">Delete this API</button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}