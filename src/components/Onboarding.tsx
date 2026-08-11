import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useUIStore } from '@/state/useUIStore';
import { useChatStore } from '@/state/useChatStore';
import { primeAudio } from '@/lib/audio';
import { PROVIDERS, PROVIDER_IDS, detectProviderByKey } from '@/lib/providers/registry';
import type { ProviderId } from '@/lib/providers/types';
import type { CustomProviderConfig } from '@/lib/providers/custom';
import CustomApiModal from '@/components/settings/CustomApiModal';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const setOnboarded = useSettingsStore(s => s.setOnboarded);
  const setApiKey = useSettingsStore(s => s.setApiKey);
  const setProvider = useSettingsStore(s => s.setProvider);
  const provider = useSettingsStore(s => s.provider);
  const setTab = useUIStore(s => s.setTab);
  const [key, setKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [customApiOpen, setCustomApiOpen] = useState(false);
  const create = useCharacterStore(s => s.create);
  const customProviders = useSettingsStore(s => s.customProviders);

  useEffect(() => {
    const auto = detectProviderByKey(key);
    if (auto && auto !== provider) {
      setProvider(auto);
    }
  }, [key, provider, setProvider]);

  const finish = () => {
    setOnboarded(true);
    if (!useWorldStore.getState().activeWorldId && useCharacterStore.getState().activeId) {
      useUIStore.getState().setWorldNotif(true);
    }
  };

  const skip = () => setOnboarded(true);

  const onPickProvider = (id: ProviderId) => {
    setProvider(id);
    const cfg = useSettingsStore.getState().customProviders.find(c => c.id === id);
    if (cfg) {
      useChatStore.getState().fetchModels(id, cfg.apiKey, true).then(() => {
        const list = useChatStore.getState().modelsByProvider[id]?.list || [];
        if (list.length && !useSettingsStore.getState().modelByProvider[id]) {
          useSettingsStore.getState().setModelFor(id, list[0].id, false);
        }
      });
    }
  };

  const onCreateSample = () => {
    setCreating(true);
    const id = create({
      name: 'Aurelia Swift',
      race: 'elf',
      subrace: 'high-elf',
      class: 'wizard',
      subclass: 'evocation',
      level: 3,
      background: 'sage',
      alignment: 'Neutral Good',
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 13, CHA: 10 },
      hp: { current: 22, max: 22, temp: 0 },
      initBonus: 0,
      saves: { STR: false, DEX: false, CON: false, INT: true, WIS: true, CHA: false },
      skills: { arcana: true, history: true, investigation: true, insight: true },
      attacks: [{ id: crypto.randomUUID(), name: 'Quarterstaff', dice: '1d6', bonus: 2, damageType: 'bludgeoning', range: '5 ft', properties: ['versatile (1d8)'] }],
      inventory: [
        { id: crypto.randomUUID(), name: 'Quarterstaff', qty: 1, weight: 4, category: 'weapon', equipped: true, damage: { dice: '1d6', type: 'bludgeoning' }, properties: ['versatile (1d8)'] },
        { id: crypto.randomUUID(), name: 'Spellbook', qty: 1, weight: 3, category: 'gear' },
        { id: crypto.randomUUID(), name: 'Component Pouch', qty: 1, weight: 2, category: 'gear' },
        { id: crypto.randomUUID(), name: 'Scholar\'s Pack', qty: 1, weight: 0, category: 'gear' }
      ],
      currency: { cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 },
      spells: { known: [], slots: [] },
      conditions: [],
      backstory: 'A scholar of ancient magics seeking lost knowledge.',
      appearance: 'Slender, sharp-featured high elf with ink-stained fingers, silver hair in a loose braid, wearing deep blue robes embroidered with constellations, a weathered leather satchel at her hip.',
      traits: 'Calm and analytical',
      ideals: 'Knowledge is the highest good',
      bonds: 'My spellbook is my life\'s work',
      flaws: 'I overthink simple problems',
      avatar: undefined
    });
    setCreating(false);
    setStep(2);
  };

  const activeCustom = customProviders.find(c => c.id === provider);
  const meta = activeCustom
    ? { label: activeCustom.label, requiresKey: false, keyPlaceholder: '', keyHint: '' }
    : PROVIDERS[provider];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)' }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          className="relative w-full max-w-[480px] m-3 rounded-2xl p-5"
          style={{ background: 'var(--bg)', border: '1px solid var(--accent)', boxShadow: '0 0 0 1px rgba(212,175,55,0.3), 0 8px 40px rgba(0,0,0,0.4)' }}
        >
          <button
            onClick={skip}
            className="absolute top-2 right-3 w-8 h-8 rounded-full text-lg leading-none flex items-center justify-center"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            aria-label="Close onboarding"
            title="Close"
          >×</button>
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Step {step + 1} of 3</div>
            <div className="flex-1 flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="flex-1 h-1 rounded-full" style={{ background: i <= step ? 'var(--accent)' : 'var(--surface-2)' }} />
              ))}
            </div>
          </div>

          {step === 0 && (
            <div className="py-2">
              <div className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--accent)' }}>Welcome, Adventurer</div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                BigDawg D&D is a solo D&D simulator powered by AI. Roll dice, build a hero, and let the DM weave a tale.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex items-start gap-2"><span style={{ color: 'var(--accent)' }}>✦</span> Full 5e character creator</li>
                <li className="flex items-start gap-2"><span style={{ color: 'var(--accent)' }}>✦</span> Animated dice with modifiers &amp; effects</li>
                <li className="flex items-start gap-2"><span style={{ color: 'var(--accent)' }}>✦</span> AI DM that mutates your sheet as you play</li>
              </ul>
            </div>
          )}

          {step === 1 && (
            <div className="py-2">
              <div className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--accent)' }}>Connect to the DM</div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                Pick a provider and paste your API key. It stays on your device — we never send it anywhere but the provider.
              </p>
              <div className="grid grid-cols-2 gap-1 mb-3">
                {PROVIDER_IDS.map(id => {
                  const m = PROVIDERS[id];
                  const active = id === provider;
                  return (
                    <button
                      key={id}
                      onClick={() => onPickProvider(id)}
                      className="text-left p-2.5 rounded-lg border"
                      style={{ background: active ? 'rgba(212,175,55,0.12)' : 'var(--surface-2)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">{m.label}</span>
                        {(m.requiresKey && (id === 'groq' || id === 'cerebras' || id === 'nim')) && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>FREE</span>}
                        {!m.requiresKey && <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>NO KEY</span>}
                      </div>
                      <div className="text-[9px] mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>{m.description}</div>
                    </button>
                  );
                })}
                {customProviders.map(cfg => {
                  const active = cfg.id === provider;
                  return (
                    <button
                      key={cfg.id}
                      onClick={() => onPickProvider(cfg.id)}
                      className="text-left p-2.5 rounded-lg border"
                      style={{ background: active ? 'rgba(212,175,55,0.12)' : 'var(--surface-2)', borderColor: active ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs truncate">{cfg.label}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>{cfg.type === 'anthropic' ? 'CLAUDE' : 'CUSTOM'}</span>
                      </div>
                      <div className="text-[9px] mt-0.5 leading-tight truncate" style={{ color: 'var(--text-muted)' }}>{cfg.baseUrl.replace(/^https?:\/\//, '')}</div>
                    </button>
                  );
                })}
                <button
                  onClick={() => setCustomApiOpen(true)}
                  className="text-left p-2.5 rounded-lg border border-dashed flex items-center justify-center"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <span className="text-xs font-semibold">＋ Add custom API</span>
                </button>
              </div>
              {activeCustom ? (
                <div className="card text-xs" style={{ background: 'rgba(212,175,55,0.08)' }}>
                  <div style={{ color: 'var(--accent)' }}>◆ {activeCustom.label} — key stored with this custom API.</div>
                  <div className="mt-1" style={{ color: 'var(--text-muted)' }}>Requests go straight to {activeCustom.baseUrl}. Tap Continue when ready.</div>
                </div>
              ) : meta.requiresKey ? (
                <>
                  <input
                    type="password"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    placeholder={meta.keyPlaceholder}
                    className="font-mono text-sm"
                    autoComplete="off"
                  />
                  <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                    {meta.keyHint} You can change provider or key anytime in Settings.
                  </p>
                </>
              ) : (
                <div className="card text-xs" style={{ background: 'rgba(212,175,55,0.08)' }}>
                  <div style={{ color: 'var(--accent)' }}>◆ Pollinations is keyless.</div>
                  <div className="mt-1" style={{ color: 'var(--text-muted)' }}>Tap Continue to start chatting — no signup, no key.</div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="py-2">
              <div className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--accent)' }}>Create Your Hero</div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                Start with a sample character or build your own.
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  className="btn btn-primary w-full"
                  onClick={onCreateSample}
                  disabled={creating}
                >
                  {creating ? 'Creating…' : 'Use sample hero: Aurelia the Wizard'}
                </button>
                <button
                  className="btn btn-ghost w-full"
                  onClick={() => { setOnboarded(true); setTab('character'); }}
                >
                  Build my own
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-4 gap-2">
            <button className="btn btn-ghost" onClick={skip}>Skip</button>
            <div className="flex gap-2">
              {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
              {step === 0 && <button className="btn btn-primary" onClick={() => { primeAudio(); setStep(1); }}>Begin</button>}
              {step === 1 && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (meta.requiresKey && key.trim()) setApiKey(key.trim());
                    setStep(2);
                  }}
                >
                  Continue
                </button>
              )}
              {step === 2 && <button className="btn btn-primary" onClick={finish}>Finish</button>}
            </div>
          </div>
        </motion.div>
      </motion.div>
      <CustomApiModal open={customApiOpen} onClose={() => setCustomApiOpen(false)} editing={null} />
    </AnimatePresence>
  );
}
