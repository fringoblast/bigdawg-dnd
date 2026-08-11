import { useState } from 'react';
import type { Character, Ability } from '@/types/character';
import { useCharacterStore, nextLevelXp, hitDieFor } from '@/state/useCharacterStore';
import { ABILITIES, SKILLS } from '@/types/character';
import { abilityMod, formatMod, profBonusForLevel } from '@/lib/dndMath';
import { buildModContext, totalSaveMod, totalSkillMod, totalAc } from '@/lib/modifiers';
import { useUIStore } from '@/state/useUIStore';

type View = 'sheet' | 'attacks' | 'spells' | 'inventory-min';

export default function CharacterSheet({ character, onEdit }: { character: Character; onEdit?: () => void }) {
  const toggleEquip = useCharacterStore(s => s.toggleEquip);
  const restoreSlots = useCharacterStore(s => s.restoreSlots);
  const update = useCharacterStore(s => s.update);
  const levelUp = useCharacterStore(s => s.levelUp);
  const setActive = useCharacterStore(s => s.setActive);
  const showToast = useUIStore(s => s.showToast);
  const [view, setView] = useState<View>('sheet');
  const [levelRollPending, setLevelRollPending] = useState(false);

  const ctx = buildModContext(character);
  const prof = profBonusForLevel(character.level);
  const exp = character.exp || 0;
  const xpForNext = nextLevelXp(character.level);
  const xpForCurrent = character.level <= 1 ? 0 : nextLevelXp(character.level - 1);
  const canLevel = xpForNext !== Infinity && exp >= xpForNext;
  const xpProgress = xpForNext === Infinity ? 1 : Math.min(1, (exp - xpForCurrent) / Math.max(1, xpForNext - xpForCurrent));

  const doLevelUp = () => {
    setLevelRollPending(true);
    const before = character.hp.max;
    levelUp(character.id, 1);
    setTimeout(() => {
      const after = useCharacterStore.getState().characters.find(c => c.id === character.id);
      const gained = after && after.hp.max > before ? after.hp.max - before : 0;
      setLevelRollPending(false);
      showToast(`Level up! ${character.name} is now level ${after?.level ?? character.level + 1}${gained ? ` (+${gained} HP)` : ''}`, 'success', 5000);
    }, 400);
  };

  return (
    <div className="p-3 pb-6">
      <div className="card-gold mb-3">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-xl font-bold" style={{ background: 'var(--surface-2)', border: '2px solid var(--accent)' }}>
            {character.avatar ? <img src={character.avatar} className="w-full h-full object-cover" alt="" /> : character.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg font-bold truncate" style={{ color: 'var(--accent)' }}>{character.name}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Level {character.level} {character.race}{character.subrace ? ` (${character.subrace})` : ''} {character.class}{character.subclass ? ` · ${character.subclass}` : ''}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{character.background}</div>
            <div className="text-[11px] mt-1 font-mono" style={{ color: 'var(--accent)' }}>
              HP {character.hp.current}/{character.hp.max}{character.hp.temp ? ` (+${character.hp.temp})` : ''}
              {character.conditions.length > 0 && (
                <span style={{ color: 'var(--text-muted)' }}> · {character.conditions.length} effect{character.conditions.length === 1 ? '' : 's'}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {onEdit && <button className="btn btn-ghost text-xs" onClick={onEdit}>Edit</button>}
            {character.level < 20 && (
              <button
                className="btn text-xs"
                onClick={doLevelUp}
                disabled={!canLevel || levelRollPending}
                title={canLevel ? `Level up to ${character.level + 1}` : `Needs ${xpForNext} XP (have ${exp})`}
                style={{
                  background: canLevel && !levelRollPending ? 'var(--accent)' : 'var(--surface-2)',
                  color: canLevel && !levelRollPending ? '#1a1a1a' : 'var(--text-muted)',
                  opacity: levelRollPending ? 0.6 : 1
                }}
              >
                {levelRollPending ? `Rolling d${hitDieFor(character.classId || character.class)}…` : `Level ${character.level + 1}`}
              </button>
            )}
          </div>
        </div>

        {/* XP bar — filled by DM XP grants, read tiers from the 5e 2024 table */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{character.level >= 20 ? 'Max level' : 'XP'}</div>
            <div className="text-[10px] font-mono" style={{ color: 'var(--accent)' }}>
              {character.level >= 20 ? '—' : `${exp} / ${xpForNext}`}
            </div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${xpProgress * 100}%`, background: 'linear-gradient(90deg, var(--accent), rgba(212,175,55,0.7))' }} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <Stat label="AC" value={totalAc(ctx)} sub={character.inventory.find(i => i.equipped && i.category === 'armor' && i.name !== 'Shield')?.name ? `(worn)` : '(unarmored)'} />
          <Stat label="INIT" value={formatMod(ctx.init)} sub="DEX" />
          <Stat label="SPEED" value={`${character.speed}ft`} />
          <Stat label="PROF" value={formatMod(prof)} />
        </div>
      </div>

      <div className="flex gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {(['sheet','attacks','spells','inventory-min'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold capitalize"
            style={{ background: view === v ? 'var(--accent)' : 'var(--surface-2)', color: view === v ? '#1a1a1a' : 'var(--text)' }}
          >{v.replace('-', ' ')}</button>
        ))}
      </div>

      {view === 'sheet' && (
        <div className="space-y-3">
          <div className="card">
            <div className="label mb-2">Ability scores</div>
            <div className="grid grid-cols-6 gap-1 text-center">
              {ABILITIES.map(ab => {
                const m = abilityMod(character.abilityScores[ab]);
                const saveProficient = character.saves[ab];
                const saveMod = totalSaveMod(ctx, ab, saveProficient);
                return (
                  <div key={ab} className="rounded-lg p-1.5" style={{ background: 'var(--surface-2)' }}>
                    <div className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>{ab}</div>
                    <div className="text-base font-mono font-bold">{character.abilityScores[ab]}</div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{formatMod(m)}</div>
                    <div className="text-[10px] mt-0.5" title="Save" style={{ color: saveProficient ? 'var(--accent)' : 'var(--text-muted)' }}>●{formatMod(saveMod)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="label">Skills</div>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>● = proficient</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              {SKILLS.map(s => {
                const prof = !!character.skills[s.id];
                const mod = totalSkillMod(ctx, s.ability, prof, character.conditions, s.id);
                return (
                  <div key={s.id} className="flex justify-between">
                    <span><span style={{ color: prof ? 'var(--accent)' : 'transparent' }}>● </span>{s.label}</span>
                    <span className="font-mono">{formatMod(mod)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="label mb-1">Currency</div>
            <div className="grid grid-cols-5 gap-1 text-center text-xs">
              {(['pp','gp','ep','sp','cp'] as const).map(k => (
                <div key={k} className="rounded p-1.5" style={{ background: 'var(--surface-2)' }}>
                  <div className="font-bold uppercase" style={{ color: 'var(--accent)' }}>{k}</div>
                  <div className="text-base font-mono">{character.currency[k]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="label mb-1">Personality</div>
            <div className="text-xs space-y-1">
              {character.appearance && <div><span className="text-[10px]" style={{ color: 'var(--accent)' }}>APPEARANCE: </span>{character.appearance}</div>}
              {character.traits && <div><span className="text-[10px]" style={{ color: 'var(--accent)' }}>TRAITS: </span>{character.traits}</div>}
              {character.ideals && <div><span className="text-[10px]" style={{ color: 'var(--accent)' }}>IDEALS: </span>{character.ideals}</div>}
              {character.bonds && <div><span className="text-[10px]" style={{ color: 'var(--accent)' }}>BONDS: </span>{character.bonds}</div>}
              {character.flaws && <div><span className="text-[10px]" style={{ color: 'var(--accent)' }}>FLAWS: </span>{character.flaws}</div>}
              {character.backstory && <div className="mt-1" style={{ color: 'var(--text-muted)' }}>{character.backstory}</div>}
            </div>
          </div>
        </div>
      )}

      {view === 'attacks' && (
        <div className="space-y-2">
          {character.attacks.length === 0 ? (
            <div className="card text-center text-sm" style={{ color: 'var(--text-muted)' }}>No attacks. Equip a weapon in Inventory.</div>
          ) : character.attacks.map(a => (
            <div key={a.id} className="card flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold" style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>⚔</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{a.name}</div>
                <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{a.dice}{a.versatileDice ? ` (${a.versatileDice} two-handed)` : ''} {a.damageType} · {a.range}</div>
              </div>
              <div className="text-right font-mono">
                <div className="text-base" style={{ color: 'var(--accent)' }}>{formatMod(a.bonus)}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>to hit</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'spells' && (
        <div className="space-y-2">
          {character.spells.slots.length === 0 ? (
            <div className="card text-center text-sm" style={{ color: 'var(--text-muted)' }}>This class can't cast spells (or no slots yet).</div>
          ) : (
            <>
              <div className="card">
                <div className="label mb-2">Spell slots</div>
                <div className="space-y-1">
                  {character.spells.slots.filter(s => s.max > 0).map(s => (
                    <div key={s.level} className="flex items-center gap-2 text-sm">
                      <div className="w-12 font-bold">L{s.level}</div>
                      <div className="flex-1 flex gap-1">
                        {Array.from({ length: s.max }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => update(character.id, { spells: { ...character.spells, slots: character.spells.slots.map(x => x.level === s.level ? { ...x, used: Math.max(0, Math.min(x.max, i < x.max - x.used ? x.max - i : x.max - i - 1)) } : x) } })}
                            className="w-5 h-5 rounded-full"
                            style={{ background: i < s.max - s.used ? 'var(--accent)' : 'var(--surface-3)', border: '1px solid var(--accent)' }}
                          />
                        ))}
                      </div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{s.max - s.used}/{s.max}</div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost w-full mt-3 text-xs" onClick={() => { restoreSlots(character.id); showToast('Long rest taken', 'success'); }}>Long Rest (restore all)</button>
              </div>
            </>
          )}
        </div>
      )}

      {view === 'inventory-min' && (
        <div className="space-y-1">
          {character.inventory.length === 0 ? (
            <div className="card text-center text-sm" style={{ color: 'var(--text-muted)' }}>Empty. Open the Inventory tab to gear up.</div>
          ) : character.inventory.map(i => (
            <div key={i.id} className="card flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!i.equipped} onChange={() => toggleEquip(character.id, i.id)} />
              <div className="flex-1 truncate">
                <div className="font-semibold">{i.name} {i.qty > 1 && <span style={{ color: 'var(--text-muted)' }}>×{i.qty}</span>}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{i.category}{i.damage ? ` · ${i.damage.dice} ${i.damage.type}` : ''}{i.ac ? ` · AC ${i.ac}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button className="btn btn-ghost flex-1 text-xs" onClick={() => { setActive(null); }}>Switch character</button>
        <button className="btn btn-ghost text-xs" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => { if (confirm(`Delete ${character.name}?`)) { setActive(null); useCharacterStore.getState().remove(character.id); } }}>Delete</button>
      </div>
    </div>
  );
}

const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="rounded-lg p-1.5" style={{ background: 'var(--surface-2)' }}>
    <div className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>{label}</div>
    <div className="text-base font-mono font-bold">{value}</div>
    {sub && <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);
