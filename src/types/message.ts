import type { ActiveEffect, Currency, Item } from './character';

export type MessageRole = 'player' | 'dm' | 'system';

export interface RollResult {
  id: string;
  expression: string;
  rolls: { die: number; sides: number; kept?: boolean }[];
  modifier: number;
  total: number;
  label?: string;
  ts: number;
}

export interface NPCIntro {
  name: string;
  role: string;
  description: string;
  disposition?: 'friendly' | 'neutral' | 'hostile' | 'unknown';
  race?: string;
  location?: string;
}

export interface StateDelta {
  hpDelta?: number;
  tempHpDelta?: number;
  hpMaxDelta?: number;
  acDelta?: number;
  currencyDelta?: Partial<Currency>;
  itemsAdd?: { name: string; qty?: number; meta?: Partial<Item> }[];
  itemsRemove?: { name: string; qty?: number }[];
  conditionsAdd?: Pick<ActiveEffect, 'name' | 'kind' | 'description'>[];
  conditionsRemove?: string[];
  spellSlotsUse?: { level: number; count: number }[];
  npcsIntroduced?: NPCIntro[];
  /** DM-awarded XP. The app levels the hero up automatically at the right thresholds. */
  exp?: number;
  /** Explicit level-up request (DM only calls this when the player crosses a milestone/XP threshold). */
  levelUp?: boolean;
  notes?: string;
}

export interface AIDiceRoll {
  expression: string;
  result: RollResult;
  at: number; // index in the prose where the bracket appeared
}

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  image?: string;
  roll?: RollResult;
  aiRolls?: AIDiceRoll[];
  stateDelta?: StateDelta;
  ts: number;
  pending?: boolean;
  error?: boolean;
}

export interface ChatSummary {
  summary: string;
  updatedAt: number;
  messageCount: number;
}
