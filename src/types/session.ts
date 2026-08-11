export type AppMode = 'dnd' | 'chat';

export interface Session {
  id: string;
  name: string;
  characterId: string;
  worldId: string | null;
  storyId: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  archived?: boolean;
  mode?: AppMode; // 'dnd' = adventure session (linked to character); 'chat' = standalone AI conversation
}
