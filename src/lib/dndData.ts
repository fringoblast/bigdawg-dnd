import type { Ability, Skill } from '@/types/character';

export interface RaceOption {
  id: string;
  name: string;
  size: 'Small' | 'Medium';
  speed: number;
  description: string;
  abilityBonuses: Partial<Record<Ability, number>>;
  subraces?: { id: string; name: string; abilityBonuses?: Partial<Record<Ability, number>>; description: string }[];
  traits: string[];
  darkvision?: boolean;
}

export interface ClassOption {
  id: string;
  name: string;
  hitDie: number;
  primaryAbility: Ability[];
  description: string;
  savingThrowProfs: Ability[];
  skillChoices: { count: number; from: Skill[] };
  startingEquipment: string[];
  spellcaster?: 'full' | 'half' | 'third' | 'pact' | 'none';
  subclasses: { id: string; name: string; description: string }[];
}

export interface BackgroundOption {
  id: string;
  name: string;
  description: string;
  skillProfs: Skill[];
  toolProfs: string[];
  languages?: number;
  equipment: string[];
  feature: string;
  suggestedPersonality: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };
}

export const RACES: RaceOption[] = [
  {
    id: 'human', name: 'Human', size: 'Medium', speed: 30,
    description: 'Versatile and ambitious, humans adapt to any role.',
    abilityBonuses: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    traits: ['Versatile (+1 to all ability scores)']
  },
  {
    id: 'elf', name: 'Elf', size: 'Medium', speed: 30, darkvision: true,
    description: 'Graceful, magical folk with keen senses.',
    abilityBonuses: { DEX: 2 },
    subraces: [
      { id: 'high-elf', name: 'High Elf', abilityBonuses: { INT: 1 }, description: 'Cantrip, longsword, shortbow, extra language.' },
      { id: 'wood-elf', name: 'Wood Elf', abilityBonuses: { WIS: 1 }, description: 'Fleet foot (35 ft), Mask of the Wild.' }
    ],
    traits: ['Darkvision 60 ft', 'Keen Senses (Perception prof)', 'Fey Ancestry', 'Trance']
  },
  {
    id: 'dwarf', name: 'Dwarf', size: 'Medium', speed: 25, darkvision: true,
    description: 'Stout and hardy, with stonecunning resilience.',
    abilityBonuses: { CON: 2 },
    subraces: [
      { id: 'hill-dwarf', name: 'Hill Dwarf', abilityBonuses: { WIS: 1 }, description: '+1 HP per level, Dwarven Toughness.' },
      { id: 'mountain-dwarf', name: 'Mountain Dwarf', abilityBonuses: { STR: 2 }, description: 'Medium armor prof.' }
    ],
    traits: ['Darkvision 60 ft (dim light as bright)', 'Dwarven Resilience (poison resist)', 'Stonecunning']
  },
  {
    id: 'halfling', name: 'Halfling', size: 'Small', speed: 25,
    description: 'Small, lucky, and surprisingly brave.',
    abilityBonuses: { DEX: 2 },
    subraces: [
      { id: 'lightfoot', name: 'Lightfoot', abilityBonuses: { CHA: 1 }, description: 'Naturally Stealthy, hide behind larger creatures.' },
      { id: 'stout', name: 'Stout', abilityBonuses: { CON: 1 }, description: 'Poison resist, Brave advantage vs frightened.' }
    ],
    traits: ['Lucky (reroll 1s)', 'Brave (advantage vs frightened)', 'Halfling Nimbleness']
  },
  {
    id: 'tiefling', name: 'Tiefling', size: 'Medium', speed: 30, darkvision: true,
    description: 'Infernal heritage grants otherworldly presence.',
    abilityBonuses: { CHA: 2, INT: 1 },
    traits: ['Darkvision 60 ft', 'Hellish Resistance (fire resist)', 'Infernal Legacy (thaumaturgy, hellish rebuke, darkness)']
  },
  {
    id: 'dragonborn', name: 'Dragonborn', size: 'Medium', speed: 30,
    description: 'Draconic ancestry burns within.',
    abilityBonuses: { STR: 2, CHA: 1 },
    traits: ['Draconic Ancestry (choose type)', 'Breath Weapon (2d6 type damage, CON save)', 'Damage Resistance (type)']
  },
  {
    id: 'gnome', name: 'Gnome', size: 'Small', speed: 25, darkvision: true,
    description: 'Clever and curious tinkerers of the fey.',
    abilityBonuses: { INT: 2 },
    subraces: [
      { id: 'rock-gnome', name: 'Rock Gnome', abilityBonuses: { CON: 1 }, description: 'Artificer\'s Lore, Tinker tools.' },
      { id: 'forest-gnome', name: 'Forest Gnome', abilityBonuses: { DEX: 1 }, description: 'Minor Illusion cantrip, speak with small beasts.' }
    ],
    traits: ['Darkvision 60 ft', 'Gnome Cunning (advantage on INT/WIS/CHA vs magic)']
  },
  {
    id: 'half-orc', name: 'Half-Orc', size: 'Medium', speed: 30, darkvision: true,
    description: 'Fierce and relentless warriors.',
    abilityBonuses: { STR: 2, CON: 1 },
    traits: ['Darkvision 60 ft', 'Relentless Endurance (drop to 1 HP once)', 'Savage Attacks (extra die on crit)']
  }
];

export const CLASSES: ClassOption[] = [
  {
    id: 'fighter', name: 'Fighter', hitDie: 10, primaryAbility: ['STR', 'DEX'],
    description: 'Master of martial combat, skilled with many weapons and armor.',
    savingThrowProfs: ['STR', 'CON'],
    skillChoices: { count: 2, from: ['acrobatics', 'animalHandling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
    startingEquipment: ['Chain mail or leather armor', 'Longsword or two shortswords', 'Light crossbow or handaxes (20 bolts or 5 handaxes)', "Explorer's pack or scholar's pack"],
    spellcaster: 'third',
    subclasses: [
      { id: 'champion', name: 'Champion', description: 'Improved critical, additional fighting style.' },
      { id: 'battle-master', name: 'Battle Master', description: 'Maneuvers, superiority dice, tactical genius.' }
    ]
  },
  {
    id: 'wizard', name: 'Wizard', hitDie: 6, primaryAbility: ['INT'],
    description: 'Scholarly magic-user with the largest spell list.',
    savingThrowProfs: ['INT', 'WIS'],
    skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
    startingEquipment: ['Spellbook', 'Quarterstaff or dagger', 'Component pouch or arcane focus', "Scholar's pack", 'Dagger'],
    spellcaster: 'full',
    subclasses: [
      { id: 'evocation', name: 'School of Evocation', description: 'Sculpt spells to avoid allies, maximize damage.' },
      { id: 'abjuration', name: 'School of Abjuration', description: 'Arcane ward, protective magic specialist.' }
    ]
  },
  {
    id: 'rogue', name: 'Rogue', hitDie: 8, primaryAbility: ['DEX'],
    description: 'Stealthy striker with sneak attack and expertise.',
    savingThrowProfs: ['DEX', 'INT'],
    skillChoices: { count: 4, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleightOfHand', 'stealth'] },
    startingEquipment: ['Rapier or shortsword', 'Shortbow or shortsword (50 arrows)', "Burglar's pack, dungeoneer's pack, or explorer's pack", 'Leather armor, two daggers, thieves\' tools'],
    spellcaster: 'none',
    subclasses: [
      { id: 'thief', name: 'Thief', description: 'Fast Hands, Second-Story Work, Use Magic Device.' },
      { id: 'assassin', name: 'Assassin', description: 'Proficiency with disguise/poison kits, Assassinate.' }
    ]
  },
  {
    id: 'cleric', name: 'Cleric', hitDie: 8, primaryAbility: ['WIS'],
    description: 'Divine spellcaster, healer or warrior of the gods.',
    savingThrowProfs: ['WIS', 'CHA'],
    skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    startingEquipment: ['Mace or warhammer (or relevant weapon)', 'Chain shirt or leather armor', 'Light crossbow or simple weapon', "Priest's pack or explorer's pack", 'Shield, holy symbol'],
    spellcaster: 'full',
    subclasses: [
      { id: 'life', name: 'Life Domain', description: 'Heavy armor, healing spells boosted.' },
      { id: 'war', name: 'War Domain', description: 'Martial weapons, heavy armor, War Priest.' }
    ]
  },
  {
    id: 'barbarian', name: 'Barbarian', hitDie: 12, primaryAbility: ['STR'],
    description: 'Fierce warrior fueled by primal rage.',
    savingThrowProfs: ['STR', 'CON'],
    skillChoices: { count: 2, from: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    startingEquipment: ['Greataxe or martial melee weapon', 'Two handaxes or simple weapon', "Explorer's pack and four javelins", 'Leather armor'],
    spellcaster: 'none',
    subclasses: [
      { id: 'berserker', name: 'Path of the Berserker', description: 'Frenzy, Mindless Rage.' },
      { id: 'totem-warrior', name: 'Path of the Totem Warrior', description: 'Spirit totem, Aspect of the Beast.' }
    ]
  },
  {
    id: 'ranger', name: 'Ranger', hitDie: 10, primaryAbility: ['DEX', 'WIS'],
    description: 'Wilderness warrior with limited spellcasting.',
    savingThrowProfs: ['STR', 'DEX'],
    skillChoices: { count: 3, from: ['animalHandling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
    startingEquipment: ['Scale mail or leather armor', 'Two shortswords or two simple melee weapons', 'Longbow or simple weapon', "Explorer's pack or dungeoneer's pack", 'Quiver (20 arrows)'],
    spellcaster: 'half',
    subclasses: [
      { id: 'hunter', name: 'Hunter', description: 'Favored enemy, fighting style, Hunter\'s Prey.' },
      { id: 'beast-master', name: 'Beast Master', description: 'Ranger\'s Companion, coordinated attack.' }
    ]
  },
  {
    id: 'paladin', name: 'Paladin', hitDie: 10, primaryAbility: ['STR', 'CHA'],
    description: 'Holy warrior bound by sacred oath.',
    savingThrowProfs: ['WIS', 'CHA'],
    skillChoices: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    startingEquipment: ['Chain mail or breastplate (or other)', 'Longsword or two martial melee weapons', 'Javelin or simple weapon', "Priest's pack or explorer's pack", 'Shield, holy symbol'],
    spellcaster: 'half',
    subclasses: [
      { id: 'devotion', name: 'Oath of Devotion', description: 'Sacred Weapon, Aura of Devotion.' },
      { id: 'vengeance', name: 'Oath of Vengeance', description: 'Relentless Avenger, Soul of Vengeance.' }
    ]
  },
  {
    id: 'sorcerer', name: 'Sorcerer', hitDie: 6, primaryAbility: ['CHA'],
    description: 'Innate magic user with raw, bloodline power.',
    savingThrowProfs: ['CON', 'CHA'],
    skillChoices: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    startingEquipment: ['Light crossbow or simple weapon', 'Component pouch or arcane focus', 'Two daggers', 'Dungeoneer\'s pack or explorer\'s pack'],
    spellcaster: 'full',
    subclasses: [
      { id: 'draconic', name: 'Draconic Bloodline', description: 'Draconic Resilience, Elemental Affinity.' },
      { id: 'wild-magic', name: 'Wild Magic', description: 'Wild Surge, Tides of Chaos.' }
    ]
  },
  {
    id: 'bard', name: 'Bard', hitDie: 8, primaryAbility: ['CHA'],
    description: 'Magical performer, jack of all trades.',
    savingThrowProfs: ['DEX', 'CHA'],
    skillChoices: { count: 3, from: ['acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival'] },
    startingEquipment: ['Rapier, longsword, or simple weapon', 'Diplomat\'s pack or entertainer\'s pack', 'Lute or musical instrument', 'Leather armor, dagger'],
    spellcaster: 'full',
    subclasses: [
      { id: 'lore', name: 'College of Lore', description: 'Bonus proficiencies, Cutting Words.' },
      { id: 'valor', name: 'College of Valor', description: 'Combat inspiration, Extra Attack.' }
    ]
  },
  {
    id: 'warlock', name: 'Warlock', hitDie: 8, primaryAbility: ['CHA'],
    description: 'Pact magic user bound to a patron.',
    savingThrowProfs: ['WIS', 'CHA'],
    skillChoices: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    startingEquipment: ['Light crossbow or simple weapon', 'Component pouch or arcane focus', 'Two daggers', 'Leather armor, scholar\'s pack or dungeons pack'],
    spellcaster: 'pact',
    subclasses: [
      { id: 'fiend', name: 'The Fiend', description: 'Dark One\'s Blessing, Fiendish Resilience.' },
      { id: 'archfey', name: 'The Archfey', description: 'Fey Presence, Misty Escape.' }
    ]
  }
];

export const BACKGROUNDS: BackgroundOption[] = [
  {
    id: 'folk-hero', name: 'Folk Hero', description: 'You come from a humble background but you are destined for so much more.',
    skillProfs: ['animalHandling', 'survival'], toolProfs: ["Vehicles (land)"],
    equipment: ["Artisan's tools or vehicles (land)", "Shovel", "Iron pot", "Set of common clothes", "Belt pouch (10 gp)"],
    feature: 'Rustic Hospitality',
    suggestedPersonality: {
      traits: ['I judge people by their actions, not their words.', 'If someone is in trouble, I\'m always ready to lend help.'],
      ideals: ['Honor', 'Courage'],
      bonds: ['I have a family, but I have no idea where they are.', 'My village is my family now.'],
      flaws: ['I can\'t resist a pretty face.', 'I\'m convinced of the significance of my destiny.']
    }
  },
  {
    id: 'noble', name: 'Noble', description: 'You understand wealth, power, and privilege.',
    skillProfs: ['history', 'persuasion'], toolProfs: ["Gaming set"],
    equipment: ['Fine clothes', 'Signet ring', 'Scroll of pedigree', 'Purse (25 gp)', 'Gaming set'],
    feature: 'Position of Privilege',
    suggestedPersonality: {
      traits: ['My eloquent flattery makes everyone I talk to feel like the most wonderful person alive.', 'I take great pains to always look my best.'],
      ideals: ['Responsibility', 'Power'],
      bonds: ['My loyalty to my sovereign is unshakable.', 'A great scandal plagues my house.'],
      flaws: ['I secretly believe everyone is beneath me.', 'I hide a truly scandalous secret.']
    }
  },
  {
    id: 'sage', name: 'Sage', description: 'You spent years learning the lore of the multiverse.',
    skillProfs: ['arcana', 'history'], toolProfs: [],
    equipment: ['Bottle of ink', 'Quill', 'Small knife', 'Letter from a dead colleague (or your latest mystery)', 'Set of common clothes', 'Belt pouch (10 gp)'],
    feature: 'Researcher',
    suggestedPersonality: {
      traits: ['I use polysyllabic words that convey the impression of great erudition.', 'I\'ve read every book in the world\'s greatest libraries.'],
      ideals: ['Knowledge', 'Self-improvement'],
      bonds: ['My life\'s work is a series of tomes bound in dragon hide.', 'I have an ancient text that holds terrible secrets.'],
      flaws: ['I am easily distracted by the promise of information.', 'I overlook obvious solutions in favor of complicated ones.']
    }
  },
  {
    id: 'criminal', name: 'Criminal', description: 'You have a history of breaking the law.',
    skillProfs: ['deception', 'stealth'], toolProfs: ["Thieves' tools", "Gaming set"],
    equipment: ['Crowbar', 'Set of dark common clothes with hood', 'Belt pouch (15 gp)'],
    feature: 'Criminal Contact',
    suggestedPersonality: {
      traits: ['I always have a plan for when things go wrong.', 'I am incredibly slow to trust.'],
      ideals: ['Honor', 'Freedom'],
      bonds: ['I\'m trying to pay off an old debt I owe to a generous benefactor.', 'Someone I loved died because of a mistake I made.'],
      flaws: ['I can\'t resist a pretty face.', 'I\'m always in debt.']
    }
  },
  {
    id: 'soldier', name: 'Soldier', description: 'War has been your life for as long as you care to remember.',
    skillProfs: ['athletics', 'intimidation'], toolProfs: ["Gaming set", "Vehicles (land)"],
    equipment: ['Insignia of rank', 'Trophy from a fallen enemy', 'Set of bone dice or deck of cards', 'Set of common clothes', 'Belt pouch (10 gp)'],
    feature: 'Military Rank',
    suggestedPersonality: {
      traits: ['I can stare down a hellhound without flinching.', 'I enjoy being strong and like breaking things.'],
      ideals: ['Responsibility', 'Might'],
      bonds: ['I would still lay down my life for the people I served with.', 'I protect those who cannot protect themselves.'],
      flaws: ['The monstrous enemy we faced still haunts me.', 'I have a weakness for the vices of the city.']
    }
  },
  {
    id: 'entertainer', name: 'Entertainer', description: 'You thrive in front of an audience.',
    skillProfs: ['acrobatics', 'performance'], toolProfs: ['Disguise kit', 'Musical instrument'],
    equipment: ['Musical instrument', 'Costume clothes', 'Belt pouch (15 gp)'],
    feature: 'By Popular Demand',
    suggestedPersonality: {
      traits: ['I know a story relevant to almost every situation.', 'When I perform, I commit fully to the role.'],
      ideals: ['Creativity', 'Expression'],
      bonds: ['My instrument is my most treasured possession.', 'A friendly patron has offered me a place to stay.'],
      flaws: ['I\'ll do anything to win applause.', 'I can\'t resist a pretty face.']
    }
  },
  {
    id: 'hermit', name: 'Hermit', description: 'You lived in seclusion, seeking spiritual truth.',
    skillProfs: ['medicine', 'religion'], toolProfs: ['Herbalism kit'],
    equipment: ['Scroll case stuffed with notes', 'Winter blanket', 'Herbalism kit', 'Set of common clothes', 'Belt pouch (5 gp)'],
    feature: 'Discovery',
    suggestedPersonality: {
      traits: ['I\'ve been isolated for so long that I rarely speak, preferring gestures.', 'I feel tremendous empathy for all who suffer.'],
      ideals: ['Enlightenment', 'Solitude'],
      bonds: ['Nothing is more important than the monks of my old order.', 'I entered seclusion to hide from those who might still be hunting me.'],
      flaws: ['I am dogmatic in my thoughts and philosophy.', 'I assume everyone is motivated by self-interest.']
    }
  },
  {
    id: 'acolyte', name: 'Acolyte', description: 'You have spent your life in service to a temple.',
    skillProfs: ['insight', 'religion'], toolProfs: [],
    equipment: ['Holy symbol', 'Prayer book or prayer wheel', '5 sticks of incense', 'Vestments', 'Set of common clothes', 'Belt pouch (15 gp)'],
    feature: 'Shelter of the Faithful',
    suggestedPersonality: {
      traits: ['I idolize a particular hero of my faith, and constantly refer to that person\'s deeds and example.', 'I can find common ground between the fiercest enemies.'],
      ideals: ['Faith', 'Charity'],
      bonds: ['I would die to recover an ancient relic of my faith that was lost long ago.', 'I seek to preserve a sacred text.'],
      flaws: ['I judge others harshly, and myself even more severely.', 'I put too much trust in those who wield power within my temple\'s hierarchy.']
    }
  }
];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9
};
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
