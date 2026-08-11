export type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export const ABILITIES: Ability[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export const ABILITY_FULL: Record<Ability, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma'
};

export type Skill =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics'
  | 'deception' | 'history' | 'insight' | 'intimidation'
  | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion' | 'sleightOfHand'
  | 'stealth' | 'survival';

export const SKILLS: { id: Skill; label: string; ability: Ability }[] = [
  { id: 'acrobatics', label: 'Acrobatics', ability: 'DEX' },
  { id: 'animalHandling', label: 'Animal Handling', ability: 'WIS' },
  { id: 'arcana', label: 'Arcana', ability: 'INT' },
  { id: 'athletics', label: 'Athletics', ability: 'STR' },
  { id: 'deception', label: 'Deception', ability: 'CHA' },
  { id: 'history', label: 'History', ability: 'INT' },
  { id: 'insight', label: 'Insight', ability: 'WIS' },
  { id: 'intimidation', label: 'Intimidation', ability: 'CHA' },
  { id: 'investigation', label: 'Investigation', ability: 'INT' },
  { id: 'medicine', label: 'Medicine', ability: 'WIS' },
  { id: 'nature', label: 'Nature', ability: 'INT' },
  { id: 'perception', label: 'Perception', ability: 'WIS' },
  { id: 'performance', label: 'Performance', ability: 'CHA' },
  { id: 'persuasion', label: 'Persuasion', ability: 'CHA' },
  { id: 'religion', label: 'Religion', ability: 'INT' },
  { id: 'sleightOfHand', label: 'Sleight of Hand', ability: 'DEX' },
  { id: 'stealth', label: 'Stealth', ability: 'DEX' },
  { id: 'survival', label: 'Survival', ability: 'WIS' }
];

export type DamageType =
  | 'slashing' | 'piercing' | 'bludgeoning'
  | 'fire' | 'cold' | 'lightning' | 'thunder' | 'acid' | 'poison'
  | 'radiant' | 'necrotic' | 'psychic' | 'force';

export type ItemCategory = 'weapon' | 'armor' | 'gear' | 'tool' | 'consumable' | 'treasure' | 'misc';

export interface Attack {
  id: string;
  name: string;
  dice: string;
  bonus: number;
  damageType: DamageType;
  range: string;
  versatileDice?: string;
  properties?: string[];
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  weight: number;
  category: ItemCategory;
  rarity?: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary';
  equipped?: boolean;
  attuned?: boolean;
  notes?: string;
  damage?: { dice: string; type: DamageType };
  ac?: number;
  acBonus?: { max?: number };
  range?: string;
  properties?: string[];
  consumable?: boolean;
}

export interface Currency {
  cp: number; sp: number; ep: number; gp: number; pp: number;
}

export interface ActiveEffect {
  id: string;
  name: string;
  kind: 'buff' | 'debuff' | 'condition';
  description?: string;
  mods?: Partial<Record<Ability, number>>;
  acMod?: number;
  attackMod?: number;
  damageMod?: number;
  saveMod?: number;
  skillMods?: Partial<Record<Skill, number>>;
  rollsBonus?: string;
  disadvantageOn?: Ability[];
  expiresAt?: number;
  source?: string;
}

export interface SpellSlot {
  level: number;
  max: number;
  used: number;
}

export interface CharacterSpell {
  name: string;
  level: number;
  school?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
  components?: string;
  prepared?: boolean;
  ritual?: boolean;
  description?: string;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  subrace?: string;
  class: string;
  subclass?: string;
  /** Class/race ids (e.g. 'wizard', 'elf', 'human') used for rules lookups — display names stay in race/subrace/class/subclass. */
  classId?: string;
  subclassId?: string;
  raceId?: string;
  subraceId?: string;
  level: number;
  /** Experience points for AI-driven leveling. */
  exp?: number;
  background: string;
  alignment?: string;
  abilityScores: Record<Ability, number>;
  hp: { current: number; max: number; temp: number };
  deathSaves?: DeathSaves;
  ac: number;
  speed: number;
  profBonus: number;
  initBonus: number;
  saves: Record<Ability, boolean>;
  skills: Partial<Record<Skill, boolean>>;
  attacks: Attack[];
  inventory: Item[];
  currency: Currency;
  spells: { known: CharacterSpell[]; slots: SpellSlot[] };
  conditions: ActiveEffect[];
  backstory: string;
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  appearance?: string;
  avatar?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeathSaves {
  successes: number;     // 0..3
  failures: number;      // 0..3
  unconscious: boolean;  // HP reached 0 and not yet stabilized/dead
  stable: boolean;       // 3 successes, still unconscious
  isDead: boolean;       // 3 failures
}
