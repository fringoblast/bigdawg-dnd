import type { Ability } from './character';

export interface WorldFaction {
  id: string;
  name: string;
  description: string;
  alignment?: string;
}

export interface WorldNPC {
  id: string;
  name: string;
  role: string;
  description: string;
  disposition?: 'friendly' | 'neutral' | 'hostile' | 'unknown';
}

export interface WorldLocation {
  id: string;
  name: string;
  description: string;
}

export type WorldTone = 'dark' | 'whimsical' | 'horror' | 'political' | 'high fantasy' | 'mystery' | 'sandbox';

export interface World {
  id: string;
  name: string;
  tone: WorldTone;
  summary: string;
  lore: string;
  factions: WorldFaction[];
  npcs: WorldNPC[];
  locations: WorldLocation[];
  hooks: string[];
  rules: string;
}

export interface Story {
  id: string;
  name: string;
  hook: string;
  incitingIncident: string;
  openingScene: string;
  currentChapter?: string;
  notes: string;
}
