import type { Character, Attack, ActiveEffect, Ability } from '@/types/character';
import { abilityMod, profBonusForLevel, computeAttackBonus, computeAc, computeInitiative } from './dndMath';

export interface ModContext {
  abilityMods: Record<Ability, number>;
  ac: number;
  init: number;
  profBonus: number;
  activeEffects: ActiveEffect[];
}

export const buildModContext = (character: Character): ModContext => {
  const mods: Record<Ability, number> = {
    STR: abilityMod(character.abilityScores.STR),
    DEX: abilityMod(character.abilityScores.DEX),
    CON: abilityMod(character.abilityScores.CON),
    INT: abilityMod(character.abilityScores.INT),
    WIS: abilityMod(character.abilityScores.WIS),
    CHA: abilityMod(character.abilityScores.CHA)
  };
  for (const e of character.conditions || []) {
    if (e.mods) for (const k in e.mods) mods[k as Ability] += e.mods[k as Ability] || 0;
  }
  return {
    abilityMods: mods,
    ac: computeAc(character),
    init: computeInitiative(character),
    profBonus: profBonusForLevel(character.level),
    activeEffects: character.conditions || []
  };
};

export const totalAttackMod = (ctx: ModContext, attack: Attack, character: Character): number => {
  let mod = computeAttackBonus(character, attack);
  for (const e of ctx.activeEffects) mod += e.attackMod || 0;
  return mod;
};

export const totalDamageMod = (ctx: ModContext, attack: Attack): number => {
  let mod = 0;
  const isFinesse = attack.properties?.includes('finesse');
  const str = isFinesse ? Math.max(ctx.abilityMods.STR, ctx.abilityMods.DEX) : ctx.abilityMods.STR;
  mod += str;
  for (const e of ctx.activeEffects) mod += e.damageMod || 0;
  return mod;
};

export const totalAc = (ctx: ModContext): number => {
  let ac = ctx.ac;
  for (const e of ctx.activeEffects) ac += e.acMod || 0;
  return ac;
};

export const totalSaveMod = (ctx: ModContext, ability: Ability, proficient: boolean): number => {
  let mod = ctx.abilityMods[ability];
  if (proficient) mod += ctx.profBonus;
  for (const e of ctx.activeEffects) mod += e.saveMod || 0;
  return mod;
};

export const totalSkillMod = (ctx: ModContext, ability: Ability, proficient: boolean, effects: ActiveEffect[], skillId?: string): number => {
  let mod = ctx.abilityMods[ability];
  if (proficient) mod += ctx.profBonus;
  for (const e of effects) {
    mod += e.skillMods?.[skillId as never] || 0;
  }
  return mod;
};
