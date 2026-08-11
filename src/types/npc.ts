export interface NPC {
  id: string;
  name: string;
  role: string;
  description: string;
  disposition: 'friendly' | 'neutral' | 'hostile' | 'unknown';
  race?: string;
  location?: string;
  firstSeenAt: number;
  sessionId: string;
  characterId: string;
  messagePreview?: string;
  notes?: string;
  status: 'alive' | 'dead' | 'unknown';
  updatedAt: number;
}

export interface NPCBackup {
  id: string;
  name: string;
  data: Omit<NPC, 'id' | 'updatedAt'>;
  createdAt: number;
}
