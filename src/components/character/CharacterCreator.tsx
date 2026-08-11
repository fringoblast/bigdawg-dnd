import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RACES, CLASSES, BACKGROUNDS, STANDARD_ARRAY, POINT_BUY_COSTS, POINT_BUY_BUDGET, POINT_BUY_MIN, POINT_BUY_MAX, type ClassOption } from '@/lib/dndData';
import { useCharacterStore, rollAllAbilities } from '@/state/useCharacterStore';
import type { Ability, Skill } from '@/types/character';
import { abilityMod, formatMod, profBonusForLevel, computeMaxHp, computeSpeed } from '@/lib/dndMath';
import { uid } from '@/lib/storage';
import { SRD_ITEMS } from '@/lib/srdItems';
import { useUIStore } from '@/state/useUIStore';
import { useSettingsStore } from '@/state/useSettingsStore';
import { tapSfx, successSfx } from '@/lib/audio';
import { portraitUrl } from '@/lib/pollinations';

type Step = 'name' | 'race' | 'class' | 'subclass' | 'background' | 'abilities' | 'skills' | 'equipment' | 'spells' | 'personality' | 'avatar' | 'review';
const STEPS: Step[] = ['name', 'race', 'class', 'subclass', 'background', 'abilities', 'skills', 'equipment', 'spells', 'personality', 'avatar', 'review'];
const STEP_LABELS: Record<Step, string> = {
  name: 'Name', race: 'Race', class: 'Class', subclass: 'Subclass', background: 'Background',
  abilities: 'Abilities', skills: 'Skills', equipment: 'Equipment', spells: 'Spells',
  personality: 'Personality', avatar: 'Avatar', review: 'Review'
};

const compressImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const MAX = 256;
    let { width, height } = img;
    if (width > MAX || height > MAX) {
      const k = Math.min(MAX / width, MAX / height);
      width = Math.round(width * k); height = Math.round(height * k);
    }
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d'); if (!ctx) return reject(new Error('no ctx'));
    ctx.drawImage(img, 0, 0, width, height);
    resolve(c.toDataURL('image/jpeg', 0.8));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
  img.src = url;
});

export default function CharacterCreator({ onDone, prefill }: { onDone: (saved?: any) => void; prefill?: any }) {
  const create = useCharacterStore(s => s.create);
  const updateChar = useCharacterStore(s => s.update);
  const showToast = useUIStore(s => s.showToast);
  const aiPortraits = useSettingsStore(s => s.aiPortraits);
  const [step, setStep] = useState<Step>(prefill ? 'review' : 'name');
  const [portraitBusy, setPortraitBusy] = useState(false);
  const portraitVariantRef = useRef(0);

  const [name, setName] = useState(prefill?.name || '');
  const [raceId, setRaceId] = useState(prefill?.raceId || prefill?.race?.toLowerCase() || 'human');
  const [subraceId, setSubraceId] = useState<string | null>(prefill?.subraceId || null);
  const [classId, setClassId] = useState(prefill?.classId || prefill?.class?.toLowerCase() || 'fighter');
  const [subclassId, setSubclassId] = useState<string | null>(prefill?.subclassId || null);
  const [level, setLevel] = useState(prefill?.level || 1);
  const [backgroundId, setBackgroundId] = useState('folk-hero');
  const [abilityMode, setAbilityMode] = useState<'standard' | 'pointbuy' | 'roll'>('standard');
  const [abilityScores, setAbilityScores] = useState<Record<Ability, number>>(prefill?.abilityScores || { STR: 13, DEX: 14, CON: 12, INT: 10, WIS: 13, CHA: 8 });
  const [pbScores, setPbScores] = useState<Record<Ability, number>>({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 });
  const [rolledScores, setRolledScores] = useState<number[]>([]);
  const [rolledAssign, setRolledAssign] = useState<Record<Ability, string | null>>({ STR: null, DEX: null, CON: null, INT: null, WIS: null, CHA: null });
  // Rolled rolls are stored as "value@index" so duplicate dice rolls stay assignable.
  const packRoll = (value: number, index: number) => `${value}@${index}`;
  const rollValue = (raw: string | null | undefined): number | undefined => {
    if (!raw) return undefined;
    const n = Number(raw.split('@')[0]);
    return isFinite(n) ? n : undefined;
  };
  const isRolledHere = (raw: string | null | undefined, v: number, i: number) => raw === packRoll(v, i);
  const usedElsewhereAb = (ab: Ability, i: number, assign: Record<Ability, string | null>) =>
    (Object.entries(assign) as [Ability, string | null][]).some(([k, vv]) => k !== ab && !!vv && vv.endsWith(`@${i}`));
const [skills, setSkills] = useState<Record<string, boolean>>(prefill?.skills || {});
  const [equipmentChoice, setEquipmentChoice] = useState<'starting' | 'gold'>(prefill ? 'starting' : 'gold');
  const [equipment, setEquipment] = useState<{ name: string; qty: number; category: any; damage?: any; ac?: number; properties?: string[]; weight?: number; equipped?: boolean; rarity?: any }[]>(prefill?.inventory || []);
  const [startGold, setStartGold] = useState(50);
  const [spells, setSpells] = useState<string[]>([]);
  const [backstory, setBackstory] = useState(prefill?.backstory || '');
  const [appearance, setAppearance] = useState(prefill?.appearance || '');
  const [traits, setTraits] = useState(prefill?.traits || '');
  const [ideals, setIdeals] = useState(prefill?.ideals || '');
  const [bonds, setBonds] = useState(prefill?.bonds || '');
  const [flaws, setFlaws] = useState(prefill?.flaws || '');
  const [avatar, setAvatar] = useState<string | undefined>(prefill?.avatar);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const race = RACES.find(r => r.id === raceId)!;
  const klass = CLASSES.find(c => c.id === classId)!;
  const background = BACKGROUNDS.find(b => b.id === backgroundId)!;
  const subrace = subraceId ? race.subraces?.find(s => s.id === subraceId) || null : null;

  const effectiveScores = useMemo<Record<Ability, number>>(() => {
    const base = abilityMode === 'standard' ? abilityScores : abilityMode === 'pointbuy' ? pbScores : applyRolled(rolledAssign);
    const out: Record<Ability, number> = { ...base };
    if (race.abilityBonuses) for (const k in race.abilityBonuses) out[k as Ability] = (out[k as Ability] || 10) + (race.abilityBonuses[k as Ability] || 0);
    if (subrace?.abilityBonuses) for (const k in subrace.abilityBonuses) out[k as Ability] = (out[k as Ability] || 10) + (subrace.abilityBonuses[k as Ability] || 0);
    return out;
  }, [abilityMode, abilityScores, pbScores, rolledAssign, race, subrace]);

  const stepIndex = STEPS.indexOf(step);
  const isLast = step === 'review';
  const canNext = (() => {
    switch (step) {
      case 'name': return name.trim().length >= 1;
      case 'race': return !!raceId && (!race.subraces || !!subraceId);
      case 'class': return !!classId;
      case 'subclass': return level < 3 || !!subclassId;
      case 'background': return !!backgroundId;
      case 'abilities':
        if (abilityMode === 'roll') {
          return Object.values(rolledAssign).every(v => v !== null);
        }
        return true;
      case 'skills': {
        // Background proficiencies are auto-selected and ALWAYS count; class picks
        // must come from the class menu on top of them.
        const bgAuto = background.skillProfs.filter(s => klass.skillChoices.from.includes(s));
        const pickedFromClass = Object.entries(skills).filter(([, v]) => v).filter(([k]) => klass.skillChoices.from.includes(k as Skill)).length;
        return pickedFromClass === klass.skillChoices.count;
      }
      case 'equipment': return true;
      case 'spells': return true;
      case 'personality': return true;
      case 'avatar': return true;
      case 'review': return true;
    }
  })();

  const next = () => { if (canNext && !isLast) { tapSfx(); setStep(STEPS[stepIndex + 1]); } else if (isLast) finalize(); };
  const back = () => { tapSfx(); if (stepIndex > 0) setStep(STEPS[stepIndex - 1]); else onDone(); };

  const finalize = () => {
    const prof = profBonusForLevel(level);
    const speed = computeSpeed(subraceId || raceId);
    const maxHp = computeMaxHp({ class: classId, level, abilityScores: effectiveScores }, klass.hitDie);

    const inv = equipmentChoice === 'starting'
      ? equipment.map(e => ({ id: uid(), name: e.name, qty: e.qty, weight: e.weight ?? 0, category: e.category, equipped: e.equipped, damage: e.damage, ac: e.ac, properties: e.properties, rarity: e.rarity }))
      : [];

    const conds: any[] = prefill?.conditions || [];
    // Merge in background proficiencies so the sheet shows every proficiency the build implies.
    const skillsAll: Partial<Record<Skill, boolean>> = { ...skills };
    for (const s of background.skillProfs) skillsAll[s] = true;
    const fields = { name, race: race.name, subrace: subrace?.name, class: klass.name, subclass: subclassId ? klass.subclasses.find(s => s.id === subclassId)?.name : undefined, level, background: background.name, abilityScores: effectiveScores, speed, profBonus: prof, initBonus: 0, saves: getSaves(klass), skills: skillsAll, attacks: deriveAttacks(inv, effectiveScores, prof), inventory: inv, backstory, appearance, traits, ideals, bonds, flaws, avatar, classId, subclassId, raceId, subraceId };
    if (prefill?.id) {
      // Edit an existing hero: keep HP/conditions/currency/spells alive, preserve identity.
      updateChar(prefill.id, fields as any);
      successSfx();
      showToast(`${name} updated`, 'success');
      onDone({ updated: true });
    } else {
      const init = { ...fields, id: uid(), alignment: '', hp: { current: maxHp, max: maxHp, temp: 0 }, currency: { cp: 0, sp: 0, ep: 0, gp: equipmentChoice === 'gold' ? startGold : 0, pp: 0 }, spells: { known: [], slots: [] }, conditions: conds, ac: 10, createdAt: Date.now(), updatedAt: Date.now() };
      create(init as any);
      successSfx();
      showToast(`${name} joins the party!`, 'success');
      onDone();
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <button className="text-sm" style={{ color: 'var(--text-muted)' }} onClick={back}>← {stepIndex > 0 ? STEP_LABELS[STEPS[stepIndex - 1]] : 'Cancel'}</button>
        <div className="text-xs" style={{ color: 'var(--accent)' }}>Step {stepIndex + 1} / {STEPS.length}</div>
      </div>
      <div className="flex gap-1 mb-4">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 h-1 rounded-full" style={{ background: i <= stepIndex ? 'var(--accent)' : 'var(--surface-2)' }} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {step === 'name' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Name your hero</h2>
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>What shall the bards sing of?</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Theron Ashvale" className="text-lg" autoFocus />
              <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>Level</div>
              <select value={level} onChange={e => setLevel(parseInt(e.target.value, 10))}>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={n}>Level {n}</option>)}
              </select>
            </div>
          )}

          {step === 'race' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Choose your race</h2>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                {RACES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setRaceId(r.id); setSubraceId(null); }}
                    className="card w-full text-left"
                    style={{ borderColor: r.id === raceId ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className="font-semibold">{r.name} <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {r.size} · {r.speed} ft</span></div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{r.description}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>Bonuses: {Object.entries(r.abilityBonuses).map(([k, v]) => `${k} +${v}`).join(', ')}</div>
                  </button>
                ))}
              </div>
              {race.subraces && (
                <div className="mt-3">
                  <div className="text-sm font-semibold mb-1">Subrace</div>
                  <div className="grid grid-cols-2 gap-2">
                    {race.subraces.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSubraceId(s.id)}
                        className="card text-left text-sm"
                        style={{ borderColor: s.id === subraceId ? 'var(--accent)' : 'var(--border)' }}
                      >
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'class' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Choose your class</h2>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {CLASSES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setClassId(c.id); setSubclassId(null); }}
                    className="card w-full text-left"
                    style={{ borderColor: c.id === classId ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className="font-semibold">{c.name} <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· d{c.hitDie} HD · {c.spellcaster === 'none' ? 'Martial' : 'Spellcaster'}</span></div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{c.description}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>Saves: {c.savingThrowProfs.join(', ')}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'subclass' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Choose a subclass</h2>
              {level < 3 ? (
                <div className="card-gold">
                  <div className="font-semibold mb-1">Available at level 3</div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>You'll choose your subclass at level 3. For now, {klass.name}s specialize in {klass.subclasses[0]?.name}.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {klass.subclasses.map(sc => (
                    <button
                      key={sc.id}
                      onClick={() => setSubclassId(sc.id)}
                      className="card w-full text-left"
                      style={{ borderColor: sc.id === subclassId ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className="font-semibold">{sc.name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{sc.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'background' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Background</h2>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {BACKGROUNDS.map(b => (
                  <button
                    key={b.id}
                    onClick={() => setBackgroundId(b.id)}
                    className="card w-full text-left"
                    style={{ borderColor: b.id === backgroundId ? 'var(--accent)' : 'var(--border)' }}
                  >
                    <div className="font-semibold">{b.name}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{b.description}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--accent)' }}>Skills: {b.skillProfs.join(', ')}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'abilities' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Ability scores</h2>
              <div className="flex gap-2 mb-3">
                {(['standard','pointbuy','roll'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setAbilityMode(m)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: abilityMode === m ? 'var(--accent)' : 'var(--surface-2)', color: abilityMode === m ? '#1a1a1a' : 'var(--text)' }}
                  >{m === 'standard' ? 'Standard Array' : m === 'pointbuy' ? 'Point Buy' : 'Roll'}</button>
                ))}
              </div>

{abilityMode === 'standard' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Assign {STANDARD_ARRAY.join(', ')} to your abilities. (Tap an assigned value to unassign.)</p>
                    <button className="text-[11px] underline" style={{ color: 'var(--accent)' }} onClick={() => setAbilityScores({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 })}>Reset</button>
                  </div>
                  <div className="space-y-2">
                    {(Object.keys(abilityScores) as Ability[]).map(ab => (
                      <div key={ab} className="flex items-center gap-2">
                        <div className="w-12 text-sm font-bold">{ab}</div>
                        <div className="flex-1 flex gap-1 flex-wrap">
                          {STANDARD_ARRAY.map(v => {
                            const usedElsewhere = (Object.entries(abilityScores) as [Ability, number][]).find(([k, vv]) => k !== ab && vv === v);
                            const isAssignedHere = abilityScores[ab] === v;
                            return (
                              <button
                                key={v}
                                disabled={!!usedElsewhere && !isAssignedHere}
                                onClick={() => setAbilityScores(s => ({ ...s, [ab]: isAssignedHere ? 10 : v }))}
                                className="w-9 h-9 rounded-lg text-sm font-bold"
                                style={{ background: isAssignedHere ? 'var(--accent)' : 'var(--surface-2)', color: isAssignedHere ? '#1a1a1a' : 'var(--text)', opacity: (!!usedElsewhere && !isAssignedHere) ? 0.3 : 1 }}
                              >{isAssignedHere ? '✓' : v}</button>
                            );
                          })}
                        </div>
                        <div className="w-10 text-right text-sm font-mono" style={{ color: 'var(--accent)' }}>{formatMod(abilityMod(abilityScores[ab]))}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {abilityMode === 'pointbuy' && (
                <div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Spend {POINT_BUY_BUDGET} points (8-15). Higher costs more.</p>
                  <div className="text-right text-xs mb-2">
                    <span style={{ color: pointBuyRemaining() < 0 ? 'var(--danger)' : 'var(--accent)' }}>
                      {pointBuyRemaining()} points remaining
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(Object.keys(pbScores) as Ability[]).map(ab => (
                      <div key={ab} className="flex items-center gap-2">
                        <div className="w-12 text-sm font-bold">{ab}</div>
                        <button className="w-8 h-8 rounded-lg" style={{ background: 'var(--surface-2)' }} onClick={() => setPbScores(s => ({ ...s, [ab]: Math.max(POINT_BUY_MIN, s[ab] - 1) }))}>−</button>
                        <div className="w-10 text-center text-base font-bold">{pbScores[ab]}</div>
                        <button className="w-8 h-8 rounded-lg" style={{ background: 'var(--surface-2)' }} onClick={() => setPbScores(s => ({ ...s, [ab]: Math.min(POINT_BUY_MAX, s[ab] + 1) }))}>+</button>
                        <div className="w-10 text-right text-sm font-mono" style={{ color: 'var(--accent)' }}>{formatMod(abilityMod(pbScores[ab]))}</div>
                        <div className="flex-1 text-right text-[11px]" style={{ color: 'var(--text-muted)' }}>{POINT_BUY_COSTS[pbScores[ab]]} pts</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {abilityMode === 'roll' && (
                <div>
                  <button className="btn btn-primary w-full mb-3" onClick={() => setRolledScores(Array.from({ length: 6 }, () => roll4d6DropLow()))}>
                    🎲 Roll 6 ability scores
                  </button>
                  {rolledScores.length > 0 && (
                    <>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {rolledScores.map((s, i) => <div key={i} className="px-2 py-1 rounded font-mono" style={{ background: 'var(--surface-2)' }}>{s}</div>)}
                      </div>
                      <div className="space-y-2">
                        {(Object.keys(rolledAssign) as Ability[]).map(ab => (
                          <div key={ab} className="flex items-center gap-2">
                            <div className="w-12 text-sm font-bold">{ab}</div>
                            <div className="flex-1 flex gap-1 flex-wrap">
                              {rolledScores.map((v, i) => {
                                // Track used-by INDEX (via packed "value@index") so duplicate rolls stay assignable.
                                return (
                                  <button
                                    key={i}
                                    disabled={usedElsewhereAb(ab, i, rolledAssign)}
                                    onClick={() => setRolledAssign(s => ({ ...s, [ab]: packRoll(v, i) }))}
                                    className="w-10 h-9 rounded-lg text-sm font-bold"
                                    style={{ background: isRolledHere(rolledAssign[ab], v, i) ? 'var(--accent)' : 'var(--surface-2)', color: isRolledHere(rolledAssign[ab], v, i) ? '#1a1a1a' : 'var(--text)', opacity: usedElsewhereAb(ab, i, rolledAssign) ? 0.3 : 1 }}
                                  >{v}</button>
                                );
                              })}
                            </div>
                            <div className="w-10 text-right text-sm font-mono" style={{ color: 'var(--accent)' }}>
                              {rollValue(rolledAssign[ab]) ? formatMod(abilityMod(rollValue(rolledAssign[ab])!)) : '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="card-gold mt-4 text-xs">
                <div className="label mb-1">With racial bonuses</div>
                <div className="grid grid-cols-6 gap-1 text-center font-mono">
                  {(Object.keys(effectiveScores) as Ability[]).map(ab => (
                    <div key={ab}>
                      <div className="font-bold" style={{ color: 'var(--accent)' }}>{ab}</div>
                      <div className="text-base">{effectiveScores[ab]}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{formatMod(abilityMod(effectiveScores[ab]))}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'skills' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Skill proficiencies</h2>
              <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>From {klass.name}: pick {klass.skillChoices.count}. From {background.name}: {background.skillProfs.join(', ')} (auto-selected).</p>
              <div className="space-y-1">
                {klass.skillChoices.from.map(skillId => {
                  const autoSelected = background.skillProfs.includes(skillId);
                  return (
                    <button
                      key={skillId}
                      onClick={() => !autoSelected && setSkills(s => ({ ...s, [skillId]: !s[skillId] }))}
                      disabled={autoSelected}
                      className="w-full text-left p-2 rounded-lg flex items-center gap-2 text-sm"
                      style={{ background: (skills[skillId] || autoSelected) ? 'rgba(212,175,55,0.12)' : 'var(--surface-2)', border: '1px solid ' + ((skills[skillId] || autoSelected) ? 'var(--accent)' : 'var(--border)'), opacity: autoSelected ? 0.7 : 1 }}
                    >
                      <span className="w-4 h-4 rounded-full inline-block" style={{ background: (skills[skillId] || autoSelected) ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)' }} />
                      <span>{skillId.replace(/([A-Z])/g, ' $1').replace(/^./, (x: string) => x.toUpperCase())}</span>
                      {autoSelected && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· background</span>}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-xs" style={{ color: 'var(--accent)' }}>Class picks: {Object.entries(skills).filter(([, v]) => v).filter(([k]) => klass.skillChoices.from.includes(k as Skill)).length} / {klass.skillChoices.count}</div>
            </div>
          )}

          {step === 'equipment' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Starting equipment</h2>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setEquipmentChoice('gold')} className="flex-1 py-3 rounded-lg text-sm font-semibold" style={{ background: equipmentChoice === 'gold' ? 'var(--accent)' : 'var(--surface-2)', color: equipmentChoice === 'gold' ? '#1a1a1a' : 'var(--text)' }}>
                  Buy with gold
                </button>
                <button onClick={() => { setEquipmentChoice('starting'); if (!equipment.length) applyStartingEquipment(); }} className="flex-1 py-3 rounded-lg text-sm font-semibold" style={{ background: equipmentChoice === 'starting' ? 'var(--accent)' : 'var(--surface-2)', color: equipmentChoice === 'starting' ? '#1a1a1a' : 'var(--text)' }}>
                  Use class package
                </button>
              </div>
              {equipmentChoice === 'gold' && (
                <div>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Start with gold. Use the Inventory tab to buy gear.</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setStartGold(g => Math.max(0, g - 5))} className="w-8 h-8 rounded-lg" style={{ background: 'var(--surface-2)' }}>−</button>
                    <input type="number" value={startGold} onChange={e => setStartGold(Math.max(0, parseInt(e.target.value) || 0))} className="text-center" />
                    <button onClick={() => setStartGold(g => g + 5)} className="w-8 h-8 rounded-lg" style={{ background: 'var(--surface-2)' }}>+</button>
                    <span className="text-sm" style={{ color: 'var(--accent)' }}>GP</span>
                  </div>
                </div>
              )}
              {equipmentChoice === 'starting' && equipment.length > 0 && (
                <div className="space-y-1">
                  {equipment.map((e, i) => <div key={i} className="card flex items-center gap-2 text-sm">
                    <span>{e.name} {e.qty > 1 ? `×${e.qty}` : ''}</span>
                  </div>)}
                </div>
              )}
            </div>
          )}

          {step === 'spells' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Spells</h2>
              {klass.spellcaster === 'none' ? (
                <div className="card-gold">
                  <p className="text-sm">{klass.name}s do not cast spells. Onwards!</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>You can edit your spell list later on the Character tab.</p>
                  <div className="card-gold text-xs">
                    <div className="label mb-1">Spell slots by level</div>
                    <div className="font-mono">{(useCharacterStore.getState().create.length, '') || ''}Will populate at level {level} {klass.name}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'personality' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Personality</h2>
              <div className="space-y-2">
                <div>
                  <div className="label">Appearance & clothing</div>
                  <textarea value={appearance} onChange={e => setAppearance(e.target.value)} rows={2} placeholder="Height, build, hair, distinguishing marks, what you're wearing" />
                </div>
                <div>
                  <div className="label">Backstory</div>
                  <textarea value={backstory} onChange={e => setBackstory(e.target.value)} rows={3} placeholder="Where are you from? What drives you?" />
                </div>
                <div>
                  <div className="label">Traits</div>
                  <input value={traits} onChange={e => setTraits(e.target.value)} placeholder="A distinctive habit or quirk" />
                </div>
                <div>
                  <div className="label">Ideals</div>
                  <input value={ideals} onChange={e => setIdeals(e.target.value)} placeholder="What you believe in" />
                </div>
                <div>
                  <div className="label">Bonds</div>
                  <input value={bonds} onChange={e => setBonds(e.target.value)} placeholder="Who/what you care about" />
                </div>
                <div>
                  <div className="label">Flaws</div>
                  <input value={flaws} onChange={e => setFlaws(e.target.value)} placeholder="Your greatest weakness" />
                </div>
              </div>
            </div>
          )}

          {step === 'avatar' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Portrait</h2>
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Optional. Used as your chat avatar and on the character list.</p>
              <div className="flex flex-col items-center gap-3">
                <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '2px solid var(--accent)' }}>
                  {avatar ? <img src={avatar} className="w-full h-full object-cover" alt="" /> : <span className="text-3xl font-display" style={{ color: 'var(--accent)' }}>{name[0]?.toUpperCase() || '?'}</span>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  try { setAvatar(await compressImage(f)); } catch { showToast('Could not process image', 'error'); }
                }} />
                <div className="flex flex-wrap gap-2 justify-center">
                  <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Upload</button>
                  {aiPortraits && (
                    <button
                      className="btn btn-ghost"
                      onClick={async () => {
                        if (!name.trim()) { showToast('Name your hero first', 'warn'); return; }
                        portraitVariantRef.current = 0;
                        setPortraitBusy(true);
                        try {
                          const url = portraitUrl({
                            name,
                            race: race.name,
                            klass: klass.name,
                            level,
                            appearance: appearance
                          }, { variant: 0 });
                          // Warm-test the URL by trying to load the image; if it succeeds we adopt it.
                          const ok = await new Promise<boolean>((resolve) => {
                            const img = new Image();
                            const t = setTimeout(() => resolve(false), 12000);
                            img.onload = () => { clearTimeout(t); resolve(true); };
                            img.onerror = () => { clearTimeout(t); resolve(false); };
                            img.src = url;
                          });
                          if (ok) { setAvatar(url); tapSfx(); }
                          else showToast('Image gen timed out — try again', 'warn');
                        } finally {
                          setPortraitBusy(false);
                        }
                      }}
                      disabled={portraitBusy}
                      style={{ opacity: portraitBusy ? 0.5 : 1 }}
                    >
                      {portraitBusy ? '✨ Conjuring…' : '✨ Generate portrait'}
                    </button>
                  )}
                  {avatar && aiPortraits && (
                    <button
                      className="btn btn-ghost"
                      onClick={async () => {
                        if (!name.trim()) return;
                        portraitVariantRef.current += 1;
                        setPortraitBusy(true);
                        try {
                          const url = portraitUrl({
                            name, race: race.name, klass: klass.name, level, appearance
                          }, { variant: portraitVariantRef.current });
                          const ok = await new Promise<boolean>((resolve) => {
                            const img = new Image();
                            const t = setTimeout(() => resolve(false), 12000);
                            img.onload = () => { clearTimeout(t); resolve(true); };
                            img.onerror = () => { clearTimeout(t); resolve(false); };
                            img.src = url;
                          });
                          if (ok) { setAvatar(url); tapSfx(); }
                          else showToast('Image gen timed out — try again', 'warn');
                        } finally {
                          setPortraitBusy(false);
                        }
                      }}
                      disabled={portraitBusy}
                    >🎲 New look</button>
                  )}
                  {avatar && <button className="btn btn-ghost" onClick={() => setAvatar(undefined)}>Remove</button>}
                </div>
                <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                  AI portraits use Pollinations (free, anonymous, no key).
                </p>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div>
              <h2 className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>Review</h2>
              <div className="card-gold">
                <div className="font-display text-lg">{name}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Level {level} {race.name}{subrace ? ` (${subrace.name})` : ''} {klass.name}{subclassId ? ` (${klass.subclasses.find(s => s.id === subclassId)?.name})` : ''}</div>
                <div className="text-sm mt-2">Background: <span style={{ color: 'var(--accent)' }}>{background.name}</span></div>
                <div className="mt-2 grid grid-cols-6 gap-1 text-center font-mono text-xs">
                  {(Object.keys(effectiveScores) as Ability[]).map(ab => (
                    <div key={ab}>
                      <div className="font-bold" style={{ color: 'var(--accent)' }}>{ab}</div>
                      <div className="text-base">{effectiveScores[ab]}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{formatMod(abilityMod(effectiveScores[ab]))}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-sm">
                  HP: <span style={{ color: 'var(--accent)' }}>{computeMaxHp({ class: classId, level, abilityScores: effectiveScores }, klass.hitDie)}</span>
                  {' · '}
                  AC: <span style={{ color: 'var(--accent)' }}>10 + DEX</span>
                  {' · '}
                  Init: <span style={{ color: 'var(--accent)' }}>{formatMod(abilityMod(effectiveScores.DEX))}</span>
                  {' · '}
                  Prof: <span style={{ color: 'var(--accent)' }}>{formatMod(profBonusForLevel(level))}</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-4 flex gap-2 safe-bottom">
        <button className="btn btn-ghost flex-1" onClick={back}>{stepIndex === 0 ? 'Cancel' : 'Back'}</button>
        <button className="btn btn-primary flex-1" onClick={next} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.4 }}>
          {isLast ? '✨ Forge Hero' : 'Next →'}
        </button>
      </div>
    </div>
  );

  function pointBuyRemaining() {
    return POINT_BUY_BUDGET - Object.values(pbScores).reduce((sum, v) => sum + (POINT_BUY_COSTS[v] || 0), 0);
  }
  function applyRolled(a: Record<Ability, string | null>): Record<Ability, number> {
    const out: Record<Ability, number> = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    for (const k in a) {
      const raw = a[k as Ability];
      if (raw != null) {
        const [v] = raw.split('@').map(Number);
        if (isFinite(v)) out[k as Ability] = v;
      }
    }
    return out;
  }
  function applyStartingEquipment() {
    const eq: any[] = [];
    const primary = klass.primaryAbility[0] === 'STR' ? 'Longsword' : 'Rapier';
    eq.push({ name: primary, qty: 1, category: 'weapon', equipped: true, damage: { dice: '1d8', type: 'slashing' } });
    eq.push({ name: 'Leather Armor', qty: 1, category: 'armor', equipped: true, ac: 11 });
    eq.push({ name: "Explorer's Pack", qty: 1, category: 'gear' });
    setEquipment(eq);
  }
  function deriveAttacks(inv: any[], scores: Record<Ability, number>, prof: number) {
    return inv
      .filter(i => i.category === 'weapon' && i.equipped && i.damage)
      .map(i => ({
        id: uid(),
        name: i.name,
        dice: i.damage.dice,
        bonus: abilityMod(scores.STR) + prof,
        damageType: i.damage.type,
        range: '5 ft',
        properties: i.properties
      }));
  }
}

const roll4d6DropLow = () => {
  const rolls = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
};

const getSaves = (klass: ClassOption) => {
  const out: Record<Ability, boolean> = { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false };
  klass.savingThrowProfs.forEach((a: Ability) => out[a] = true);
  return out;
};
