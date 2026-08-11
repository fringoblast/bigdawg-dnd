import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Character, ActiveEffect, Item, Currency, Attack, SpellSlot, CharacterSpell, Ability, DeathSaves } from '@/types/character';
import { profBonusForLevel, computeMaxHp, computeSpeed, computeAc } from '@/lib/dndMath';
import { uid, idbStorage } from '@/lib/storage';
import { CLASSES, RACES } from '@/lib/dndData';

const DEATH_SAVE_CONDITIONS = new Set(['DeathSaveSuccess', 'DeathSaveFail']);
// Names reserved for the engine and never added to the visible conditions array.
const RESERVED_CONDITIONS_LOWER = new Set(['dying', 'stable', 'dead', 'revived']);

const defaultDeathSaves = (): DeathSaves => ({ successes: 0, failures: 0, unconscious: false, stable: false, isDead: false });

const reviveDeathSaves = (): DeathSaves => ({ successes: 0, failures: 0, unconscious: false, stable: false, isDead: false });

export interface CharacterStoreState {
  characters: Character[];
  activeId: string | null;
  create: (c: Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'profBonus' | 'speed' | 'ac'> & { id?: string }) => string;
  update: (id: string, patch: Partial<Character>) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  active: () => Character | null;
  applyDelta: (id: string, delta: import('@/types/message').StateDelta) => void;
  addCondition: (id: string, c: Pick<ActiveEffect, 'name' | 'kind' | 'description'>) => void;
  removeCondition: (id: string, name: string) => void;
  addItem: (id: string, item: Omit<Item, 'id'>) => void;
  removeItem: (id: string, name: string, qty?: number) => void;
  toggleEquip: (id: string, itemId: string) => void;
  addAttack: (id: string, a: Omit<Attack, 'id'>) => void;
  removeAttack: (id: string, attackId: string) => void;
  spendSlot: (id: string, level: number, count?: number) => void;
  restoreSlots: (id: string) => void;
  levelUp: (id: string, steps?: number) => void;
  revive: (id: string, newHp?: number) => void;
  import: (chars: Character[], activeId: string | null) => void;
  export: () => { characters: Character[]; activeId: string | null };
}

const rollAbility = () => {
  const rolls = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
};

export const rollAllAbilities = (): Record<Ability, number> => ({
  STR: rollAbility(), DEX: rollAbility(), CON: rollAbility(), INT: rollAbility(), WIS: rollAbility(), CHA: rollAbility()
});

const findClass = (id: string) => CLASSES.find(c => c.id === id || c.name.toLowerCase() === (id || '').toLowerCase());
const findRace = (id: string) => {
  const target = (id || '').toLowerCase();
  const flat = RACES as any as { id: string; name: string; speed: number }[];
  return flat.find(r => r.id === target || r.name.toLowerCase() === target);
};

export const useCharacterStore = create<CharacterStoreState>()(
  persist(
    (set, get) => ({
      characters: [],
      activeId: null,
      create: (c) => {
        const id = c.id || uid();
        const klass = findClass(c.classId || c.class);
        const race = findRace(c.raceId || c.race);
        const profBonus = profBonusForLevel(c.level);
        const speed = race?.speed ?? computeSpeed(c.race);
        const baseChar: Character = {
          ...c,
          id,
          profBonus,
          speed,
          classId: klass?.id,
          raceId: race?.id,
          attacks: c.attacks || [],
          spells: c.spells || { known: [], slots: [] },
          conditions: c.conditions || [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as Character;
        if (klass) {
          baseChar.spells = baseChar.spells || { known: [], slots: [] };
          if (!baseChar.spells.slots.length && klass.spellcaster && klass.spellcaster !== 'none') {
            baseChar.spells.slots = defaultSpellSlots(klass.spellcaster, c.level);
          }
        }
        baseChar.ac = computeAc(baseChar);
        set(state => ({ characters: [...state.characters, baseChar], activeId: id }));
        return id;
      },
      update: (id, patch) => {
        set(state => ({
          characters: state.characters.map(c => {
            if (c.id !== id) return c;
            const merged = { ...c, ...patch, updatedAt: Date.now() } as Character;
            merged.profBonus = profBonusForLevel(merged.level);
            merged.ac = computeAc(merged);
            return merged;
          })
        }));
      },
      remove: (id) => set(state => {
        const next = state.characters.filter(c => c.id !== id);
        return { characters: next, activeId: state.activeId === id ? (next[0]?.id || null) : state.activeId };
      }),
      setActive: (id) => set({ activeId: id }),
      active: () => {
        const s = get();
        return s.characters.find(c => c.id === s.activeId) || null;
      },
      applyDelta: (id, d) => {
        set(state => ({
          characters: state.characters.map(c => {
            if (c.id !== id) return c;
            const next = { ...c } as Character;
            // --- HP transitions trigger death save state changes ---
            let hpEnteredZero = false;
            let hpLeftZero = false;
            if (typeof d.hpDelta === 'number') {
              const before = next.hp.current;
              // Damage consumes TEMP HP first (5e rules), so figure the "effective"
              // current HP the AI damage should be applied against.
              const tempBefore = next.hp.temp || 0;
              let after = before;
              let tempAfter = tempBefore;
              if (d.hpDelta < 0) {
                const raw = -d.hpDelta;
                const consumedTemp = Math.min(tempBefore, raw);
                tempAfter = tempBefore - consumedTemp;
                const remainder = raw - consumedTemp;
                after = Math.max(0, Math.min(next.hp.max, before - remainder));
              } else {
                after = Math.max(0, Math.min(next.hp.max, before + d.hpDelta));
              }
              if (before > 0 && after <= 0) hpEnteredZero = true;
              if (before <= 0 && after > 0) hpLeftZero = true;
              next.hp = { ...next.hp, current: after, temp: tempAfter };
            }
            if (typeof d.tempHpDelta === 'number') {
              const td = Math.max(0, Math.min(999, (next.hp.temp || 0) + d.tempHpDelta));
              next.hp = { ...next.hp, temp: td };
            }
            if (typeof d.hpMaxDelta === 'number' && d.hpMaxDelta !== 0) {
              const newMax = Math.max(1, next.hp.max + d.hpMaxDelta);
              next.hp = { ...next.hp, max: newMax, current: Math.min(next.hp.current, newMax) };
            }
            if (typeof d.acDelta === 'number') next.ac = d.acDelta;
            if (d.currencyDelta) {
              const base: Currency = next.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
              const cur: Currency = { cp: base.cp, sp: base.sp, ep: base.ep, gp: base.gp, pp: base.pp };
              for (const k of ['cp','sp','ep','gp','pp'] as const) {
                const dv = (d.currencyDelta as any)[k];
                if (typeof dv === 'number' && isFinite(dv)) cur[k] = Math.max(0, (typeof cur[k] === 'number' && isFinite(cur[k]) ? cur[k] : 0) + dv);
              }
              next.currency = cur;
            }
            if (d.itemsAdd?.length) {
              const inv = [...next.inventory];
              for (const add of d.itemsAdd) {
                const existing = inv.findIndex(i => i.name.toLowerCase() === add.name.toLowerCase() && i.category === (add.meta?.category || guessCategory(add.name)));
                if (existing >= 0) inv[existing] = { ...inv[existing], qty: inv[existing].qty + (add.qty || 1) };
                else inv.push({
                  id: uid(),
                  name: add.name,
                  qty: add.qty || 1,
                  weight: add.meta?.weight ?? 1,
                  category: add.meta?.category || guessCategory(add.name),
                  rarity: add.meta?.rarity,
                  damage: add.meta?.damage,
                  ac: add.meta?.ac,
                  properties: add.meta?.properties,
                  consumable: add.meta?.category === 'consumable',
                  notes: undefined
                });
              }
              next.inventory = inv;
            }
            if (d.itemsRemove?.length) {
              let inv = [...next.inventory];
              for (const rem of d.itemsRemove) {
                const idx = inv.findIndex(i => i.name.toLowerCase() === rem.name.toLowerCase());
                if (idx >= 0) {
                  const left = inv[idx].qty - (rem.qty || 1);
                  if (left <= 0) inv.splice(idx, 1);
                  else inv[idx] = { ...inv[idx], qty: left };
                }
              }
              next.inventory = inv;
            }
            // Death save state machine ------------------------------------
            if (!next.deathSaves) next.deathSaves = defaultDeathSaves();
            if (hpEnteredZero) {
              next.deathSaves = { successes: 0, failures: 0, unconscious: true, stable: false, isDead: false };
              if (!next.conditions.find(c => c.name.toLowerCase() === 'dying')) {
                next.conditions = [...next.conditions, { id: uid(), name: 'Dying', kind: 'condition', description: 'HP at 0 — death saving throws', source: 'dm' } as ActiveEffect];
              }
            }
            if (hpLeftZero) {
              // Waking up from dying via healing.
              const ds = next.deathSaves;
              if (ds.unconscious || ds.stable || ds.isDead) {
                next.deathSaves = reviveDeathSaves();
              }
              next.conditions = next.conditions.filter(c => {
                const n = c.name.toLowerCase();
                return n !== 'dying' && n !== 'dead' && n !== 'stable';
              });
            }
            // -------------------------------------------------------------
            if (d.conditionsAdd?.length) {
              for (const add of d.conditionsAdd) {
                const name = add.name.trim();
                const lower = name.toLowerCase();
                if (RESERVED_CONDITIONS_LOWER.has(lower)) {
                  // Handled by the engine below; skip adding to the visible list.
                  continue;
                }
                if (DEATH_SAVE_CONDITIONS.has(name)) {
                  // Virtual sentinel used by the AI to drive death save counters.
                  const ds: DeathSaves = next.deathSaves || defaultDeathSaves();
                  if (name === 'DeathSaveSuccess') ds.successes = Math.min(3, ds.successes + 1);
                  else if (name === 'DeathSaveFail') ds.failures = Math.min(3, ds.failures + 1);
                  // 3 successes → stable (still unconscious); 3 failures → dead.
                  if (ds.successes >= 3) ds.stable = true;
                  if (ds.failures >= 3) { ds.isDead = true; ds.unconscious = false; }
                  next.deathSaves = ds;
                  continue;
                }
                if (!next.conditions.find(c => c.name.toLowerCase() === lower)) {
                  next.conditions = [...next.conditions, { id: uid(), name, kind: add.kind, description: add.description, source: 'dm' }];
                }
              }
            }
            // AI may explicitly emit "Stable" or "Dead" as terminal conditions.
            if (d.conditionsAdd?.some(x => x.name.trim().toLowerCase() === 'stable')) {
              const ds: DeathSaves = next.deathSaves || defaultDeathSaves();
              ds.stable = true;
              ds.isDead = false;
              ds.unconscious = true;
              ds.successes = Math.max(ds.successes, 3);
              ds.failures = 0;
              next.deathSaves = ds;
              if (!next.conditions.find(c => c.name.toLowerCase() === 'stable')) {
                next.conditions = [...next.conditions, { id: uid(), name: 'Stable', kind: 'condition', description: 'Stable but unconscious', source: 'dm' }];
              }
              next.conditions = next.conditions.filter(c => c.name.toLowerCase() !== 'dying');
            }
            if (d.conditionsAdd?.some(x => x.name.trim().toLowerCase() === 'dead')) {
              const ds: DeathSaves = next.deathSaves || defaultDeathSaves();
              ds.isDead = true;
              ds.unconscious = false;
              ds.stable = false;
              ds.failures = Math.max(ds.failures, 3);
              next.deathSaves = ds;
              if (!next.conditions.find(c => c.name.toLowerCase() === 'dead')) {
                next.conditions = [...next.conditions, { id: uid(), name: 'Dead', kind: 'condition', description: 'Slain — I wanna live anyways?', source: 'dm' }];
              }
              next.conditions = next.conditions.filter(c => {
                const n = c.name.toLowerCase();
                return n !== 'dying' && n !== 'stable';
              });
            }
            if (d.conditionsRemove?.length) {
              const removeLower = d.conditionsRemove.map(r => r.toLowerCase());
              next.conditions = next.conditions.filter(c => !removeLower.includes(c.name.toLowerCase()));
              // If "Dying" was explicitly cleared, also clear deathSaves.
              if (removeLower.includes('dying')) {
                const ds: DeathSaves = next.deathSaves || defaultDeathSaves();
                if (!ds.isDead) next.deathSaves = reviveDeathSaves();
              }
              if (removeLower.includes('dead')) {
                const ds: DeathSaves = next.deathSaves || defaultDeathSaves();
                ds.isDead = false;
                next.deathSaves = ds;
              }
            }
            if (d.spellSlotsUse?.length) {
              const slots = next.spells.slots.map(s => ({ ...s }));
              for (const u of d.spellSlotsUse) {
                const s = slots.find(x => x.level === u.level);
                if (s) s.used = Math.max(0, Math.min(s.max, s.used + u.count));
              }
              next.spells = { ...next.spells, slots };
            }
            // XP + level-ups (AI-driven). applyDelta may be called with just { exp } on a
            // milestone turn, or with { levelUp: true } when the DM says "new level".
            if (typeof d.exp === 'number' && d.exp > 0) {
              next.exp = (next.exp || 0) + d.exp;
            }
            const targetLevel = d.levelUp ? next.level + 1 : levelFromXp(next.exp || 0);
            if (targetLevel > next.level) {
              applyLevelUp(next, targetLevel - next.level);
            }
            next.ac = computeAc(next);
            next.updatedAt = Date.now();
            return next;
          })
        }));
      },
      addCondition: (id, c) => {
        set(state => ({
          characters: state.characters.map(ch => ch.id === id
            ? { ...ch, conditions: ch.conditions.find(x => x.name.toLowerCase() === c.name.toLowerCase()) ? ch.conditions : [...ch.conditions, { id: uid(), ...c, source: 'manual' }], updatedAt: Date.now() }
            : ch)
        }));
      },
      removeCondition: (id, name) => {
        set(state => ({
          characters: state.characters.map(ch => ch.id === id
            ? { ...ch, conditions: ch.conditions.filter(c => c.name.toLowerCase() !== name.toLowerCase()), updatedAt: Date.now() }
            : ch)
        }));
      },
      addItem: (id, item) => set(state => ({
        characters: state.characters.map(c => c.id === id ? { ...c, inventory: [...c.inventory, { id: uid(), ...item }], updatedAt: Date.now() } : c)
      })),
      removeItem: (id, name, qty = 1) => set(state => ({
        characters: state.characters.map(c => {
          if (c.id !== id) return c;
          const inv = [...c.inventory];
          const idx = inv.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
          if (idx >= 0) {
            const left = inv[idx].qty - qty;
            if (left <= 0) inv.splice(idx, 1); else inv[idx] = { ...inv[idx], qty: left };
          }
          return { ...c, inventory: inv, updatedAt: Date.now() };
        })
      })),
      toggleEquip: (id, itemId) => set(state => ({
        characters: state.characters.map(c => {
          if (c.id !== id) return c;
          const inv = c.inventory.map(i => i.id === itemId ? { ...i, equipped: !i.equipped } : i);
          const updated = { ...c, inventory: inv, updatedAt: Date.now() };
          updated.ac = computeAc(updated);
          return updated;
        })
      })),
      addAttack: (id, a) => set(state => ({
        characters: state.characters.map(c => c.id === id ? { ...c, attacks: [...c.attacks, { id: uid(), ...a }], updatedAt: Date.now() } : c)
      })),
      removeAttack: (id, attackId) => set(state => ({
        characters: state.characters.map(c => c.id === id ? { ...c, attacks: c.attacks.filter(a => a.id !== attackId), updatedAt: Date.now() } : c)
      })),
      spendSlot: (id, level, count = 1) => set(state => ({
        characters: state.characters.map(c => {
          if (c.id !== id) return c;
          const slots = c.spells.slots.map(s => s.level === level ? { ...s, used: Math.min(s.max, s.used + count) } : s);
          return { ...c, spells: { ...c.spells, slots }, updatedAt: Date.now() };
        })
      })),
      restoreSlots: (id) => set(state => ({
        characters: state.characters.map(c => c.id === id
          ? { ...c, spells: { ...c.spells, slots: c.spells.slots.map(s => ({ ...s, used: 0 })) }, hp: { ...c.hp, current: c.hp.max, temp: 0 }, conditions: c.conditions.filter(x => x.kind !== 'condition'), updatedAt: Date.now() }
          : c)
      })),
      /** Manual level-up button on the sheet. Rolls the hit die per level, grants XP credit. */
      levelUp: (id, steps = 1) => set(state => ({
        characters: state.characters.map(c => {
          if (c.id !== id) return c;
          const next = { ...c, hp: { ...c.hp }, spells: { ...c.spells, slots: c.spells.slots.map(s => ({ ...s })) } } as Character;
          applyLevelUp(next, steps);
          if (next.level > c.level) {
            next.exp = next.exp || 0;
            // Credit the XP needed for the new level so the bar looks right.
            const idx = Math.min(next.level, LEVEL_XP.length - 1);
            if (next.exp < LEVEL_XP[idx]) next.exp = LEVEL_XP[idx];
          }
          next.updatedAt = Date.now();
          return next;
        })
      })),
      revive: (id, newHp = 1) => set(state => ({
        characters: state.characters.map(c => {
          if (c.id !== id) return c;
          const next: Character = {
            ...c,
            hp: { ...c.hp, current: Math.max(1, Math.min(c.hp.max, newHp)), temp: 0 },
            deathSaves: reviveDeathSaves(),
            updatedAt: Date.now()
          } as Character;
          // Strip only Dying/Dead/Stable, never "Revived" — we want repeat clicks
              // to be idempotent (keep one "Revived" marker, don't strip it).
          const filtered = next.conditions.filter(x => {
            const n = x.name.toLowerCase();
            return n !== 'dying' && n !== 'dead' && n !== 'stable';
          });
          const alreadyRevived = filtered.some(x => x.name.toLowerCase() === 'revived');
          next.conditions = alreadyRevived
            ? filtered
            : [...filtered, { id: uid(), name: 'Revived', kind: 'condition', description: 'Chose to live against the odds.', source: 'manual' }];
          next.ac = computeAc(next);
          return next;
        })
      })),
      import: (chars, activeId) => set({ characters: chars, activeId }),
      export: () => ({ characters: get().characters, activeId: get().activeId })
    }),
    {
      name: 'bd-character',
      storage: createJSONStorage(() => idbStorage),
      version: 1
    }
  )
);

const guessCategory = (name: string): Item['category'] => {
  const n = name.toLowerCase();
  if (n.includes('potion') || n.includes('elixir') || n.includes('scroll') || n.includes('antitoxin')) return 'consumable';
  if (n.includes('sword') || n.includes('axe') || n.includes('bow') || n.includes('dagger') || n.includes('mace') || n.includes('hammer') || n.includes('staff') || n.includes('javelin')) return 'weapon';
  if (n.includes('armor') || n.includes('mail') || n.includes('plate') || n.includes('shield')) return 'armor';
  if (n.includes('gem') || n.includes('coin') || n.includes('gold') || n.includes('jewel')) return 'treasure';
  return 'misc';
};

const defaultSpellSlots = (kind: 'full' | 'half' | 'third' | 'pact' | 'none', level: number): SpellSlot[] => {
  const slots: SpellSlot[] = [];
  if (level < 1) return slots;
  const tables: Record<'full' | 'half' | 'third' | 'pact', number[][]> = {
    full: [
      [], [2], [3], [4,2], [4,3], [4,3,2], [4,3,3], [4,3,3,1], [4,3,3,2], [4,3,3,3,1],
      [4,3,3,3,2], [4,3,3,3,2,1], [4,3,3,3,2,1], [4,3,3,3,2,1,1], [4,3,3,3,2,1,1], [4,3,3,3,2,1,1,1], [4,3,3,3,2,1,1,1,1]
    ],
    half: [
      [], [2], [3], [3,2], [3,3], [3,3,2], [3,3,3], [3,3,3,1], [3,3,3,2], [3,3,3,3,1],
      [3,3,3,3,2], [3,3,3,3,2,1], [3,3,3,3,2,1], [3,3,3,3,2,1,1], [3,3,3,3,2,1,1], [3,3,3,3,2,1,1,1], [3,3,3,3,2,1,1,1,1]
    ],
    third: [
      [], [1,1], [2,1], [2,2], [2,2], [2,2,1], [2,2,1], [2,2,1,1], [2,2,1,1], [2,2,1,1],
      [2,2,1,1], [2,2,1,1], [2,2,1,1,1], [2,2,1,1,1], [2,2,1,1,1], [2,2,1,1,1], [2,2,1,1,1,1]
    ],
    pact: [
      [], [1], [2], [2,2], [2,2], [2,2,2], [2,2,2], [2,2,2,2], [2,2,2,2], [2,2,2,2,1],
      [2,2,2,2,1], [2,2,2,2,1], [2,2,2,2,1,1], [2,2,2,2,1,1], [2,2,2,2,1,1], [2,2,2,2,1,1], [2,3,2,2,1,1,1]
    ]
  };
  const t = tables[kind as 'full' | 'half' | 'third' | 'pact'];
  const row = t[Math.min(17, level)] || t[t.length - 1];
  row.forEach((n, i) => slots.push({ level: i + 1, max: n, used: 0 }));
  return slots;
};

/** 5e 2024 XP thresholds (cumulative). */
export const LEVEL_XP = [
  0,        // L1 starts at 0
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

const levelFromXp = (xp: number): number => {
  for (let i = LEVEL_XP.length - 1; i >= 1; i--) {
    if (xp >= LEVEL_XP[i]) return i;
  }
  return 1;
};

export const nextLevelXp = (level: number): number => LEVEL_XP[Math.min(level + 1, 20)] ?? Infinity;
export const hitDieFor = (cls: string): number => findClass(cls)?.hitDie ?? 8;

/** Recompute all derived stats for applying `steps` level-ups in place. Rolls hit dice per level. */
const applyLevelUp = (next: Character, steps: number): void => {
  const d = hitDieFor(next.classId || next.class);
  const klass = findClass(next.classId || next.class);
  const conMod = Math.floor((next.abilityScores.CON - 10) / 2);
  let leveled = 0;
  while (leveled < steps && next.level < 20) {
    next.level += 1;
    // Roll the hit die (avg if we're not sure how the table settled? No — roll it for drama),
    // then compensate, clamped to >= 1.
    const roll = 1 + Math.floor(Math.random() * d);
    const raw = roll + conMod;
    const gain = Math.max(1, raw);
    next.hp = { ...next.hp, max: next.hp.max + gain, current: next.hp.current + gain };
    if (klass?.spellcaster && klass.spellcaster !== 'none') {
      next.spells.slots = defaultSpellSlots(klass.spellcaster, next.level);
    }
    leveled++;
  }
  next.profBonus = profBonusForLevel(next.level);
};

export { rollAbility, defaultSpellSlots };
