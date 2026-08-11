import type { WorldTone } from '@/types/world';

export const TOTAL_TONE_NOTES: Record<WorldTone, string> = {
  'high fantasy': 'Epic, hopeful, mythic. Heroes and villains are clear. Emphasize wonder, prophecy, and legendary stakes.',
  'dark': 'Gritty, morally grey. Violence has weight, hope is hard-won. Lean into cost and consequence.',
  'horror': 'Dread, paranoia, the unknown. Pace reveals, let tension build, threats feel overwhelming.',
  'political': 'Intrigue, factions, social leverage. Combat is the failure state. Words and leverage win.',
  'whimsical': 'Witty, light, characterful. Puns, oddities, and clever solutions. Stakes can be high; tone is fun.',
  'mystery': 'Clues, red herrings, and reveals. Reward careful observation. NPCs have secrets layered on secrets.',
  'sandbox': 'Open world, player-driven. Present interesting locations and NPCs; let the player choose the path.'
};

export const WRITING_PHRASES: Record<string, string[]> = {
  default: [
    'The DM is writing your story…',
    'The DM flips through the monster manual…',
    'The DM rolls a secret check…',
    'The DM consults the gods…',
    'The DM lights another torch…',
    'The DM sketches the dungeon map…',
    'The DM ponders your fate…',
    'The DM sifts through ancient tomes…',
    'The DM weighs your choices…',
    'The DM traces the threads of fate…',
    'The DM sharpens a quill…',
    'The DM whispers to the dice…',
    'The DM closes their eyes and listens…',
    'The DM rearranges the encounter…',
    'The DM checks the loot table…',
    'The DM smiles mischievously…',
    'The DM lights a candle in a quiet room…',
    'The DM hums a forgotten lullaby…',
    'The DM chalks a rune on the table…',
    'The DM summons a familiar…'
  ],
  combat: [
    'The DM draws a weapon from the vault…',
    'The DM rolls initiative…',
    'The DM whispers to the monsters…',
    'The DM slides the battlemap into view…',
    'The DM checks the critical hit table…',
    'The DM polishes a +1 sword…',
    'The DM squares off against you…'
  ],
  exploration: [
    'The DM unfolds a worn map…',
    'The DM describes a new horizon…',
    'The DM dusts off an ancient door…',
    'The DM peers into the dark…',
    'The DM smells the dungeon air…',
    'The DM charts the path ahead…'
  ],
  social: [
    'The DM adopts a new voice…',
    'The DM sizes up the merchant…',
    'The DM pours two tankards of ale…',
    'The DM checks the NPC\'s motives…',
    'The DM reads the room…',
    'The DM lets an NPC finish their line…'
  ]
};

export const pickWritingPhrase = (situation: 'default' | 'combat' | 'exploration' | 'social' = 'default'): string => {
  const pool = [...WRITING_PHRASES.default, ...WRITING_PHRASES[situation]];
  return pool[Math.floor(Math.random() * pool.length)];
};
