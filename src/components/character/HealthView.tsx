import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Character, ActiveEffect, Ability, DeathSaves } from '@/types/character';
import { ABILITIES, ABILITY_FULL } from '@/types/character';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useChatStore } from '@/state/useChatStore';
import { useSessionStore } from '@/state/useSessionStore';
import { useUIStore } from '@/state/useUIStore';
import { tapSfx, diceSfx, haptics, successSfx } from '@/lib/audio';
import { rollExpression } from '@/lib/diceEngine';
import { buildModContext, totalSaveMod } from '@/lib/modifiers';
import { formatMod } from '@/lib/dndMath';
import { triggerDMResponse } from '@/lib/dmAutoTrigger';
import type { RollResult } from '@/types/message';

const FALLBACK_DEATH_SAVES: DeathSaves = { successes: 0, failures: 0, unconscious: false, stable: false, isDead: false };

// Translate the HP fraction into a red→amber→green palette for the bar and the digits.
const colorForPct = (pct: number): { bar: string; text: string; tint: string } => {
  if (pct > 50) return { bar: 'linear-gradient(90deg, #2c8a4a, #4de87c)', text: '#4de87c', tint: '#2c8a4a' };
  if (pct > 20) return { bar: 'linear-gradient(90deg, #b8881f, #ffd700)', text: '#ffd700', tint: '#b8881f' };
  return { bar: 'linear-gradient(90deg, #a82a1a, #ff4d4d)', text: '#ff4d4d', tint: '#a82a1a' };
};

const fmtTimeAgo = (ts: number): string => {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** Single rolling-state: which ability is currently animating & the result. */
type SaveRollState = { ability: Ability; status: 'rolling' | 'done'; result?: number; mod?: number; total?: number; critical?: boolean };
type DeathRollState = { status: 'idle' | 'single-rolling' | 'complete'; rolls: { die: number; successes: number; failures: number; crit?: boolean }[] };

export default function HealthView({ character }: { character: Character }) {
  const update = useCharacterStore(s => s.update);
  const revive = useCharacterStore(s => s.revive);
  const applyDelta = useCharacterStore(s => s.applyDelta);
  const addCondition = useCharacterStore(s => s.addCondition);
  const removeCondition = useCharacterStore(s => s.removeCondition);
  const showToast = useUIStore(s => s.showToast);
  const addChatMessage = useChatStore(s => s.add);
  const activeDndSessionId = useSessionStore(s => s.activeSessionIdByMode.dnd);

  const [editingHP, setEditingHP] = useState(false);
  const [hpInput, setHpInput] = useState(String(character.hp.current));
  const [newCond, setNewCond] = useState('');
  const [newCondKind, setNewCondKind] = useState<'buff' | 'debuff' | 'condition'>('buff');
  const [justFlashed, setJustFlashed] = useState(false);
  const lastHpRef = useRef(character.hp.current);
  const lastDsRef = useRef<string>(JSON.stringify(character.deathSaves || FALLBACK_DEATH_SAVES));

  // Save & death save rolling state
  const [saveRoll, setSaveRoll] = useState<SaveRollState | null>(null);
  const [deathRoll, setDeathRoll] = useState<DeathRollState>({ status: 'idle', rolls: [] });

  const hpPct = (character.hp.current / Math.max(1, character.hp.max)) * 100;
  const colors = colorForPct(hpPct);
  const ds = character.deathSaves || FALLBACK_DEATH_SAVES;
  const isDying = character.hp.current === 0 && !ds.isDead && !ds.stable;

  // Flash the HP bar whenever the DM (or the player) changes HP. Uses both current HP and death-save
  // state so a single DeathSaveFail doesn't quietly change the sheet without a visual cue.
  useEffect(() => {
    const dsJson = JSON.stringify(character.deathSaves || FALLBACK_DEATH_SAVES);
    if (lastHpRef.current !== character.hp.current || lastDsRef.current !== dsJson) {
      lastHpRef.current = character.hp.current;
      lastDsRef.current = dsJson;
      setJustFlashed(true);
      const t = setTimeout(() => setJustFlashed(false), 1800);
      return () => clearTimeout(t);
    }
  }, [character.hp.current, character.deathSaves]);

  const saveHP = () => {
    const next = Math.max(0, Math.min(character.hp.max, parseInt(hpInput) || 0));
    update(character.id, { hp: { ...character.hp, current: next } });
    setEditingHP(false);
  };

  const addNewCondition = () => {
    if (!newCond.trim()) return;
    addCondition(character.id, { name: newCond.trim(), kind: newCondKind, description: '' });
    setNewCond('');
  };

  const onRevive = () => {
    if (!character) return;
    revive(character.id, 1);
    showToast('Revived. HP = 1. Death saves cleared.', 'success');
    if (activeDndSessionId) {
      addChatMessage(activeDndSessionId, { role: 'system', text: `🪄 ${character.name} chose to live against the odds. HP reset to 1.` });
    }
  };

  const modCtx = useMemo(() => buildModContext(character), [character]);
  const saveMods = useMemo(() => {
    const m: Record<Ability, number> = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
    for (const ab of ABILITIES) m[ab] = totalSaveMod(modCtx, ab, !!character.saves[ab]);
    return m;
  }, [modCtx, character.saves]);

  // -------- Saving-throw handler ---------------------------------------
  const onRollSave = (ability: Ability) => {
    if (saveRoll?.status === 'rolling') return; // debounce
    const mod = saveMods[ability];
    diceSfx(20);
    haptics(mod ? 12 : 8);
    setSaveRoll({ ability, status: 'rolling' });
    setTimeout(() => {
      // Roll a single d20 (no modifier baked in — we apply mod separately so the
      // toast and chat bubble can show the un-modified d20 face for nat-20/1 vibes).
      const r = rollExpression('d20');
      const total = r.total + mod;
      const isCrit = r.rolls[0]?.die === 20;
      const isFumble = r.rolls[0]?.die === 1;
      if (isCrit) successSfx();
      else if (isFumble) haptics([0, 60, 60, 60]);
      setSaveRoll({ ability, status: 'done', result: r.rolls[0]?.die ?? 0, mod, total, critical: isCrit });
      // Build a clean RollResult whose expression advertises the modifier so chat history
      // and the formatRoll helper both render the save mod (not just the raw d20).
      const label = `${ABILITY_FULL[ability]} save`;
      const exprWithMod = `d20${mod >= 0 ? '+' : ''}${mod}`;
      const result: RollResult = { ...r, expression: exprWithMod, total, modifier: mod, label };
      if (activeDndSessionId) {
        // Single source of truth for chat: triggerDMResponse pushes its own preamble
        // (which includes the verdict + crit/fumble tag) plus the player action. The
        // DM's reply arrives below as a normal assistant bubble. No direct addChatMessage
        // here — that would duplicate the verdict and balloon the chat log with three
        // near-simultaneous bubbles per tap.
        triggerDMResponse({
          attachedRoll: result,
          text: `I make a ${ABILITY_FULL[ability]} saving throw.`,
          preamble: formatSavePreamble(character.name, ability, r.rolls[0]?.die ?? 0, mod, total, isCrit, isFumble)
        }).then(r => {
          if (!r.ok && r.reason) showToast(r.reason, 'info');
        });
      } else {
        showToast('No active session — start one in the Story tab to send rolls to the DM.', 'warn');
      }
      // Auto-clear the result chip after a few seconds so the UI doesn't stay cluttered.
      setTimeout(() => setSaveRoll(s => s?.status === 'done' && s.ability === ability ? null : s), 4500);
    }, 900);
  };

  // -------- Death-save handler ------------------------------------------
  const remainingDeathSaves = Math.max(0, 3 - Math.max(ds.successes, ds.failures));
  const deathSavesInProgress = isDying && remainingDeathSaves > 0;

  const onRollDeathSave = () => {
    if (deathRoll.status !== 'idle') return; // debounce
    if (!deathSavesInProgress) return;
    diceSfx(20);
    haptics(18);
    setDeathRoll({ status: 'single-rolling', rolls: [] });
    setTimeout(() => {
      const r = rollExpression('d20');
      const die = r.rolls[0]?.die ?? 0;
      const isCrit = die === 20;
      const isFumble = die === 1;
      if (isCrit) successSfx();
      else if (isFumble) haptics([0, 60, 60, 60]);
      else if (die >= 10) successSfx();
      else haptics([0, 50, 50, 50]);
      // 5e 2024: nat20 = 1 success + 1 HP regen + conscious; nat1 = 2 failures.
      const successesThisRoll = isCrit ? 1 : (die >= 10 ? 1 : 0);
      const failuresThisRoll = isFumble ? 2 : (die < 10 ? 1 : 0);
      // Apply via sendDelta-friendly path so the engine's death save state machine
      // (which already knows DeathSaveSuccess / DeathSaveFail sentinels) updates.
      const conditionsToAdd: { name: string; kind: 'condition'; description: string }[] = [];
      for (let i = 0; i < successesThisRoll; i++) {
        conditionsToAdd.push({ name: 'DeathSaveSuccess', kind: 'condition', description: 'Death save success' });
      }
      for (let i = 0; i < failuresThisRoll; i++) {
        conditionsToAdd.push({ name: 'DeathSaveFail', kind: 'condition', description: 'Death save failure' });
      }
      // For nat20, also apply +1 HP (engine's patch in applyDelta equates HP delta with
      // the new current HP path; we add via hpDelta = 1 which on top of HP=0 gives 1).
      const hpDelta = isCrit ? 1 : 0;
      applyDelta(character.id, {
        conditionsAdd: conditionsToAdd,
        hpDelta
      });
      // Submit to chat
      const tag = isCrit ? '🌟 NAT 20 ' : isFumble ? '💀 NAT 1 ' : '';
      const verdict = isCrit ? 'Success · +1 HP · conscious!' : (die >= 10 ? '✓ Success' : '✗ Failure');
      const text = `${tag}Death save #${remainingDeathSaves}: d20 ${die} → ${verdict}`;
      const newCount = { successes: ds.successes + successesThisRoll, failures: ds.failures + failuresThisRoll };
      const reachedStable = newCount.successes >= 3;
      const reachedDead = newCount.failures >= 3;
      if (activeDndSessionId) {
        addChatMessage(activeDndSessionId, { role: 'system', text });
        triggerDMResponse({
          text: `I roll a death saving throw (d20 ${die}).`,
          preamble: `💀 ${character.name} rolled a death save: ${verdict} (${newCount.successes}/3 ✓, ${newCount.failures}/3 ✗)${reachedStable ? ' — STABLE!' : reachedDead ? ' — DEAD!' : ''}`
        }).then(r => {
          if (!r.ok && r.reason) showToast(r.reason, 'info');
        });
      }
      setDeathRoll({
        status: 'complete',
        rolls: [{ die, successes: successesThisRoll, failures: failuresThisRoll, crit: isCrit || isFumble || undefined }]
      });
      // Auto-clear the result chip after a few seconds.
      setTimeout(() => setDeathRoll({ status: 'idle', rolls: [] }), 4500);
    }, 900);
  };

  return (
    <div className="p-3 pb-8 space-y-3">
      {/* Big HP card — the source of truth for the player's vitals */}
      <div
        className="card-gold text-center relative overflow-hidden"
        style={{
          boxShadow: justFlashed ? `0 0 0 2px ${colors.tint}, 0 0 28px ${colors.tint}88` : undefined,
          transition: 'box-shadow 350ms ease-out'
        }}
      >
        <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--accent)' }}>Hit Points</div>
        {editingHP ? (
          <div className="flex gap-2 justify-center items-center mt-2">
            <input
              type="number"
              value={hpInput}
              onChange={e => setHpInput(e.target.value)}
              className="text-center text-3xl font-mono font-bold w-28"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && saveHP()}
            />
            <button className="btn btn-primary text-xs" onClick={saveHP}>Save</button>
            <button className="btn btn-ghost text-xs" onClick={() => setEditingHP(false)}>Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setHpInput(String(character.hp.current)); setEditingHP(true); }}
            className="block w-full mt-1"
            title="Tap to edit HP"
          >
            <div className="font-mono text-6xl font-bold leading-none" style={{ color: colors.text }}>
              {character.hp.current}
              <span className="text-2xl font-mono font-normal ml-1" style={{ color: 'var(--text-muted)' }}>/ {character.hp.max}</span>
              {character.hp.temp > 0 && <span className="text-lg font-mono font-normal ml-1" style={{ color: '#5b9bd5' }}>(+{character.hp.temp})</span>}
            </div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>tap to edit</div>
          </button>
        )}
        <div className="h-3 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
          <motion.div
            className="h-full rounded-full"
            initial={false}
            animate={{ width: `${hpPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ background: colors.bar }}
          />
        </div>
      </div>

      {/* Saving Throws — first-class UI, allows one-handed quick-rolling mid-combat */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="label">Saving Throws</div>
          {saveRoll?.status === 'done' && (
            <div className="text-[10px] font-mono" style={{
              color: saveRoll.critical ? 'var(--accent)' : 'var(--text)'
            }}>
              {saveRoll.ability}: d20={saveRoll.result} {formatMod(saveRoll.mod ?? 0)} = <strong style={{ color: 'var(--accent)' }}>{saveRoll.total}</strong>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ABILITIES.map(ab => {
            const isRolling = saveRoll?.status === 'rolling' && saveRoll.ability === ab;
            const justShowed = saveRoll?.status === 'done' && saveRoll.ability === ab;
            const prof = !!character.saves[ab];
            const mod = saveMods[ab];
            return (
              <button
                key={ab}
                onClick={() => onRollSave(ab)}
                disabled={saveRoll?.status === 'rolling'}
                className="relative flex flex-col items-center justify-center py-2 rounded-lg overflow-hidden"
                style={{
                  background: justShowed ? 'var(--accent)' : prof ? 'var(--surface-2)' : 'var(--surface)',
                  border: '1px solid',
                  borderColor: prof ? 'var(--accent)' : 'var(--border)',
                  color: justShowed ? '#1a1a1a' : 'var(--text)',
                  opacity: saveRoll?.status === 'rolling' && !isRolling ? 0.5 : 1,
                  transition: 'all 200ms ease',
                  boxShadow: justShowed ? '0 0 18px rgba(212,175,55,0.5)' : undefined
                }}
                title={`Roll a ${ABILITY_FULL[ab]} save (${prof ? 'proficient' : 'not proficient'})`}
              >
                {isRolling ? (
                  <motion.div
                    initial={{ rotate: 0, scale: 0.6, opacity: 0 }}
                    animate={{ rotate: 720, scale: 1, opacity: 1 }}
                    transition={{ duration: 0.88, ease: 'easeOut' }}
                    className="font-display text-xl font-bold"
                    style={{ color: 'var(--accent)' }}
                  >
                    d20
                  </motion.div>
                ) : justShowed ? (
                  <div className="text-center">
                    <div className="text-[9px] uppercase font-bold tracking-wider opacity-70">{ab}</div>
                    <div className="font-mono font-bold text-base leading-none">{saveRoll.total}</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="flex items-center gap-1 justify-center">
                      <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: prof ? 'var(--accent)' : 'var(--text-muted)' }}>{ab}</span>
                      {prof && <span className="text-[8px]" style={{ color: 'var(--accent)' }}>●</span>}
                    </div>
                    <div className="font-mono text-sm font-bold">{formatMod(mod)}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Tap a save to roll — result is sent to DM and narrated in chat.
        </div>
      </div>

      {/* Death-save block — only visible when relevant */}
      <AnimatePresence>
        {(isDying || ds.stable || ds.isDead) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="card" style={{ borderColor: ds.isDead ? 'var(--danger)' : ds.stable ? '#5b9bd5' : 'var(--accent)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="label" style={{ color: ds.isDead ? 'var(--danger)' : ds.stable ? '#5b9bd5' : 'var(--accent)' }}>
                  {ds.isDead ? '☠ Dead' : ds.stable ? '💤 Stable (unconscious)' : '☠ Death saving throws'}
                </div>
                {!ds.isDead && (
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Success ≥ 10 · Fail ≤ 9 · Nat20 = +1 HP · Nat1 = 2 fails
                  </div>
                )}
              </div>
              <div className="flex gap-4 items-center">
                <DeathPips label="Successes" filled={ds.successes} tone="good" />
                <DeathPips label="Failures" filled={ds.failures} tone="bad" />
              </div>
              {/* Death save rolling UI: only available while actively dying */}
              {deathSavesInProgress && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { tapSfx(); onRollDeathSave(); }}
                      disabled={deathRoll.status !== 'idle'}
                      className="flex-1 btn text-sm font-bold tracking-wide"
                      style={{
                        background: deathRoll.status === 'idle' ? 'linear-gradient(180deg, var(--accent), var(--accent-dim))' : 'var(--surface-3)',
                        color: deathRoll.status === 'idle' ? '#1a1a1a' : 'var(--text-muted)',
                        opacity: deathRoll.status === 'idle' ? 1 : 0.6,
                        boxShadow: deathRoll.status === 'idle' ? '0 0 18px rgba(212,175,55,0.4)' : undefined
                      }}
                    >
                      {deathRoll.status === 'single-rolling'
                        ? '🎲 Rolling…'
                        : `☠ Roll Death Save${remainingDeathSaves > 1 ? ` (${remainingDeathSaves} left)` : ''}`}
                    </button>
                  </div>
                  <AnimatePresence>
                    {deathRoll.status === 'complete' && deathRoll.rolls[0] && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="mt-2 text-center text-xs font-mono"
                        style={{
                          color: deathRoll.rolls[0].crit ? 'var(--accent)' : (deathRoll.rolls[0].die >= 10 ? '#2c8a4a' : 'var(--danger)')
                        }}
                      >
                        d20 <strong style={{ fontSize: '14px' }}>{deathRoll.rolls[0].die}</strong> ·
                        {' '}{deathRoll.rolls[0].successes > 0 && `+${deathRoll.rolls[0].successes} success${deathRoll.rolls[0].successes > 1 ? 'es' : ''}`}
                        {deathRoll.rolls[0].failures > 0 && `+${deathRoll.rolls[0].failures} failure${deathRoll.rolls[0].failures > 1 ? 's' : ''}`}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {ds.stable && !ds.isDead && (
                <div className="mt-3 text-xs text-center" style={{ color: '#5b9bd5' }}>
                  ✅ Stable — you wake at 1 HP after 1d4 hours, or when healed.
                </div>
              )}
              {ds.isDead && (
                <button
                  onClick={() => { tapSfx(); onRevive(); }}
                  className="btn w-full mt-3 text-base font-bold tracking-wide"
                  style={{
                    background: 'linear-gradient(180deg, #a82a1a, #7a1a10)',
                    color: '#fff',
                    border: '1px solid #d04432',
                    animation: 'pulseSoft 1.6s ease-in-out infinite'
                  }}
                >
                  ❤️ I wanna live anyways
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active effects & conditions */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="label">Active Effects & Conditions</div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {character.conditions.length} active
          </div>
        </div>
        {character.conditions.length === 0 ? (
          <div className="text-center text-sm py-4 border border-dashed rounded-lg" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
            No active conditions. Add buffs, debuffs, or 5e conditions below.
          </div>
        ) : (
          <div className="space-y-2 mb-3">
            {character.conditions.map(c => <ConditionRow key={c.id} c={c} onClear={() => removeCondition(character.id, c.name)} />)}
          </div>
        )}
        <div className="flex gap-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <input
            value={newCond}
            onChange={e => setNewCond(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNewCondition()}
            placeholder="e.g. Blessed, Poisoned, Frightened…"
            className="flex-1 text-sm"
          />
          <select value={newCondKind} onChange={e => setNewCondKind(e.target.value as any)} className="text-xs w-24">
            <option value="buff">Buff</option>
            <option value="debuff">Debuff</option>
            <option value="condition">Condition</option>
          </select>
          <button className="btn btn-primary text-xs" onClick={addNewCondition}>Add</button>
        </div>
      </div>

      {/* Vitals row — quick-glance stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <Vital label="AC" value={character.ac} />
        <Vital label="INIT" value={formatSigned(character.initBonus)} />
        <Vital label="SPEED" value={`${character.speed}ft`} />
        <Vital label="PROF" value={`+${character.profBonus}`} />
      </div>

      {/* Last-update indicator — surfaces when AI or manual edits happened */}
      <div className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
        Last update: {fmtTimeAgo(character.updatedAt)}
      </div>
    </div>
  );
}

const formatSigned = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

/** Build a single, friendly system bubble describing a save throw so the chat log stays tidy. */
const formatSavePreamble = (name: string, ability: Ability, die: number, mod: number, total: number, isCrit: boolean, isFumble: boolean): string => {
  const tag = isCrit ? '🌟 NAT 20 ' : isFumble ? '💀 NAT 1 ' : '';
  return `🛡️ ${tag}${name} rolled a ${ABILITY_FULL[ability]} save: d20 ${die} ${formatMod(mod)} = ${total}`;
};
/** Build a single, friendly system bubble describing a death save — keeps chat log tidy. */
const formatDeathSavePreamble = (name: string, die: number, isCrit: boolean, isFumble: boolean, verdict: string, ok: number, fails: number, reachedStable: boolean, reachedDead: boolean): string => {
  const tag = isCrit ? '🌟 NAT 20 ' : isFumble ? '💀 NAT 1 ' : '';
  const tail = reachedStable ? ' — STABLE!' : reachedDead ? ' — DEAD!' : '';
  return `💀 ${tag}${name} rolled a death save: d20 ${die} → ${verdict} (${ok}/3 ✓, ${fails}/3 ✗)${tail}`;
};

const Vital = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-lg p-2" style={{ background: 'var(--surface-2)' }}>
    <div className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>{label}</div>
    <div className="text-base font-mono font-bold">{value}</div>
  </div>
);

const DeathPips = ({ label, filled, tone }: { label: string; filled: number; tone: 'good' | 'bad' }) => {
  const color = tone === 'good' ? '#2c8a4a' : '#a82a1a';
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-[10px] uppercase tracking-wider w-16" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-4 h-4 rounded-full border-2" style={{
            borderColor: color,
            background: i < filled ? color : 'transparent'
          }} />
        ))}
      </div>
      <div className="font-mono text-xs" style={{ color }}>{filled}/3</div>
    </div>
  );
};

const ConditionRow = ({ c, onClear }: { c: ActiveEffect; onClear: () => void }) => {
  const dot = c.kind === 'buff' ? '#2c8a4a' : c.kind === 'debuff' ? '#a82a1a' : 'var(--accent)';
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{c.name}</div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {c.kind}{c.source === 'dm' ? ' · DM applied' : c.source === 'manual' ? ' · you' : ''}
        </div>
      </div>
      <button className="btn btn-ghost text-xs px-2 py-0.5" onClick={onClear}>×</button>
    </div>
  );
};
