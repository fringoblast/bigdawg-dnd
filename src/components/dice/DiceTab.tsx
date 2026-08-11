import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useRollStore } from '@/state/useRollStore';
import { useChatStore } from '@/state/useChatStore';
import { useUIStore } from '@/state/useUIStore';
import { useSettingsStore } from '@/state/useSettingsStore';
import { rollExpression, formatRoll } from '@/lib/diceEngine';
import { abilityMod, profBonusForLevel, formatMod } from '@/lib/dndMath';
import { buildModContext, totalAttackMod, totalDamageMod, totalSaveMod, totalSkillMod } from '@/lib/modifiers';
import { ABILITIES, SKILLS, type Ability } from '@/types/character';
import { diceSfx, haptics, successSfx } from '@/lib/audio';
import { sendToChat } from './sendToChat';

const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100];

export default function DiceTab() {
  const active = useCharacterStore(s => s.active());
  const history = useRollStore(s => s.history);
  const addRoll = useRollStore(s => s.add);
  const showToast = useUIStore(s => s.showToast);
  const [modifier, setModifier] = useState(0);
  const [rolling, setRolling] = useState<{ sides: number; key: number } | null>(null);
  const [lastResult, setLastResult] = useState<{ sides: number; rolls: number[]; total: number; mod: number; label?: string; key: number } | null>(null);

  const roll = (sides: number, label?: string) => {
    diceSfx(sides);
    haptics(15);
    const key = Date.now();
    setRolling({ sides, key });
    setTimeout(() => {
      const r = rollExpression(`d${sides}`, label);
      const total = r.total + modifier;
      r.total = total;
      r.modifier = modifier;
      if (label) r.label = label;
      addRoll(r);
      setLastResult({ sides, rolls: r.rolls.map(x => x.die), total, mod: modifier, label, key });
      setRolling(null);
      if (sides === 20 && r.rolls[0]?.die === 20) successSfx();
      if (sides === 20 && r.rolls[0]?.die === 1) haptics([0, 60, 60, 60]);
    }, 1100);
  };

  return (
    <div className="p-3">
      <div className="card-gold text-center py-6 mb-3 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, var(--accent), transparent 60%)' }} />
        <div className="text-xs label mb-2">Roll a die</div>
        <div className="relative h-32 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {rolling ? (
              <motion.div
                key={`r-${rolling.key}`}
                initial={{ rotate: 0, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 1080, scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.05, ease: 'easeOut' }}
                className="w-24 h-24 flex items-center justify-center font-display font-bold text-3xl"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))', color: '#1a1a1a', borderRadius: 14, boxShadow: '0 0 32px rgba(212,175,55,0.4)' }}
              >
                d{rolling.sides}
              </motion.div>
            ) : lastResult ? (
              <motion.div
                key={`l-${lastResult.key}`}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <div className="font-display text-6xl font-bold" style={{ color: 'var(--accent)' }}>{lastResult.total}</div>
                <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  d{lastResult.sides} {lastResult.mod !== 0 ? `${lastResult.mod >= 0 ? '+' : ''}${lastResult.mod}` : ''}
                  {' · '}[{lastResult.rolls.join(', ')}]
                </div>
                {lastResult.label && <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>{lastResult.label}</div>}
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-5xl" style={{ color: 'var(--accent)' }}>d20</motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-center gap-2 mt-2">
          <button onClick={() => setModifier(m => m - 1)} className="w-8 h-8 rounded-lg" style={{ background: 'var(--surface-2)' }}>−</button>
          <div className="w-16 text-center font-mono text-base">mod {formatMod(modifier)}</div>
          <button onClick={() => setModifier(m => m + 1)} className="w-8 h-8 rounded-lg" style={{ background: 'var(--surface-2)' }}>+</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {DIE_TYPES.map(s => (
          <button
            key={s}
            onClick={() => roll(s)}
            className="aspect-square rounded-xl font-display font-bold text-2xl flex items-center justify-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
          >
            d{s}
          </button>
        ))}
      </div>

      {active && (
        <div className="card mb-3">
          <div className="label mb-2">Quick rolls</div>
          <div className="grid grid-cols-2 gap-2">
            <QuickAttack character={active} onRoll={(l, exp) => { const r = rollExpression(exp, l); showToast(String(r.total), 'success'); setLastResult({ sides: 20, rolls: r.rolls.map(x=>x.die), total: r.total, mod: 0, label: l, key: Date.now() }); addRoll(r); }} />
            <QuickSave character={active} onRoll={roll} />
          </div>
          <button
            onClick={() => {
              if (!active || !lastResult) return;
              const r = { id: crypto.randomUUID(), expression: `d${lastResult.sides}`, rolls: lastResult.rolls.map(d => ({ die: d, sides: lastResult.sides })), modifier: lastResult.mod, total: lastResult.total, label: lastResult.label, ts: Date.now() };
              sendToChat(active, r);
              showToast('Sent to DM', 'success');
            }}
            disabled={!lastResult}
            className="btn btn-primary w-full mt-2 text-sm"
            style={{ opacity: lastResult ? 1 : 0.4 }}
          >
            📤 Send to DM
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="label">History</div>
          <button onClick={() => useRollStore.getState().clear()} className="text-xs" style={{ color: 'var(--text-muted)' }}>Clear</button>
        </div>
        {history.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No rolls yet.</div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {history.map(r => (
              <div key={r.id} className="text-xs flex items-center gap-2 py-1.5 px-2 rounded" style={{ background: 'var(--surface-2)' }}>
                <span className="font-mono" style={{ color: 'var(--accent)' }}>{r.total}</span>
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>[{r.rolls.map(x => x.die).join(',')}]</span>
                <span className="flex-1 truncate">{r.label || r.expression}</span>
                {active && (
                  <button
                    onClick={() => sendToChat(active, r)}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--surface-3)', color: 'var(--accent)' }}
                  >📤</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const QuickAttack = ({ character, onRoll }: { character: import('@/types/character').Character; onRoll: (label: string, expr: string) => void }) => {
  const weapon = character.attacks[0];
  if (!weapon) return <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No weapon equipped.</div>;
  const ctx = buildModContext(character);
  const atk = totalAttackMod(ctx, weapon, character);
  return (
    <button
      onClick={() => onRoll(`Attack: ${weapon.name}`, `d20`)}
      className="card text-left text-sm"
    >
      <div className="label">Attack</div>
      <div className="font-semibold">{weapon.name}</div>
      <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>d20+{atk} · {weapon.dice} {weapon.damageType}</div>
    </button>
  );
};

const QuickSave = ({ character, onRoll }: { character: import('@/types/character').Character; onRoll: (sides: number, label: string) => void }) => {
  const [ab, setAb] = useState<Ability>('DEX');
  const ctx = buildModContext(character);
  const mod = totalSaveMod(ctx, ab, character.saves[ab]);
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <div className="label">Save</div>
        <select value={ab} onChange={e => setAb(e.target.value as Ability)} className="text-xs py-0 px-1 w-16 h-7">
          {ABILITIES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <button
        onClick={() => onRoll(20, `${ab} save`)}
        className="w-full text-left"
      >
        <div className="font-semibold">{ab} Save</div>
        <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>d20{mod >= 0 ? '+' : ''}{mod}{character.saves[ab] ? ' (prof)' : ''}</div>
      </button>
    </div>
  );
};
