import type { Ability } from '@/types/character';
import type { Character } from '@/types/character';

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

export const formatMod = (mod: number): string => (mod >= 0 ? `+${mod}` : `${mod}`);

export const profBonusForLevel = (level: number): number => {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
};

export const computeAc = (character: Pick<Character, 'abilityScores' | 'inventory'>): number => {
  const dexMod = abilityMod(character.abilityScores.DEX);
  const equippedArmor = character.inventory.find(i => i.equipped && i.category === 'armor' && i.ac && i.name !== 'Shield');
  const shield = character.inventory.find(i => i.equipped && i.name === 'Shield' && i.category === 'armor');

  let base = 10 + dexMod;
  if (equippedArmor?.ac) {
    if (equippedArmor.name === 'Leather Armor' || equippedArmor.name === 'Studded Leather' || equippedArmor.name === 'Padded Armor') {
      base = equippedArmor.ac + dexMod;
    } else {
      base = Math.max(equippedArmor.ac, equippedArmor.ac + (dexMod > 2 ? 2 : dexMod));
    }
  }
  if (shield?.ac) base += shield.ac;
  return base;
};

export const computeInitiative = (character: Pick<Character, 'abilityScores' | 'initBonus'>): number =>
  abilityMod(character.abilityScores.DEX) + (character.initBonus || 0);

export const computeAttackBonus = (character: Pick<Character, 'abilityScores' | 'profBonus'>, attack: { name: string; properties?: string[] }): number => {
  const isFinesse = attack.properties?.includes('finesse');
  const ab = isFinesse
    ? Math.max(abilityMod(character.abilityScores.STR), abilityMod(character.abilityScores.DEX))
    : abilityMod(character.abilityScores.STR);
  return ab + character.profBonus;
};

export const computeMaxHp = (character: Pick<Character, 'class' | 'level' | 'abilityScores'>, hitDie: number): number => {
  const conMod = abilityMod(character.abilityScores.CON);
  const first = hitDie + conMod;
  return first + (character.level - 1) * Math.floor((hitDie + 1) / 2 + conMod);
};

export const computeSpeed = (race: string): number => {
  if (race === 'dwarf' || race === 'gnome' || race === 'halfling') return 25;
  if (race === 'wood-elf') return 35;
  return 30;
};

export const rollDiceExpression = (expr: string): { rolls: number[]; total: number } => {
  const cleaned = expr.replace(/\s+/g, '').toLowerCase();
  const re = /(\d*)d(\d+)(?:kh(\d+))?(?:kl(\d+))?([+-]\d+)?/g;
  let total = 0;
  const rolls: number[] = [];
  let matched = false;
  for (const m of cleaned.matchAll(re)) {
    matched = true;
    const count = parseInt(m[1] || '1', 10);
    const sides = parseInt(m[2], 10);
    const kh = m[3] ? parseInt(m[3], 10) : undefined;
    const kl = m[4] ? parseInt(m[4], 10) : undefined;
    const mod = m[5] ? parseInt(m[5], 10) : 0;
    const local: number[] = [];
    for (let i = 0; i < count; i++) {
      local.push(1 + Math.floor(Math.random() * sides));
    }
    let kept = [...local];
    if (kh !== undefined) kept = kept.sort((a, b) => b - a).slice(0, kh);
    else if (kl !== undefined) kept = kept.sort((a, b) => a - b).slice(0, kl);
    rolls.push(...local);
    total += kept.reduce((s, n) => s + n, 0) + mod;
  }
  if (!matched) {
    const flat = parseInt(cleaned, 10);
    if (!isNaN(flat)) total = flat;
  }
  return { rolls, total };
};
