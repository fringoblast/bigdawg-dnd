import type { Character } from '@/types/character';
import type { RollResult } from '@/types/message';
import { useChatStore } from '@/state/useChatStore';
import { useSessionStore } from '@/state/useSessionStore';
import { formatRoll } from '@/lib/diceEngine';

/**
 * Route a dice-roll notification into the ACTIVE D&D session (not the character id —
 * messages live under sessions). If no active D&D session exists, we create one so
 * the DM still hears the roll instead of the message ending up in a dead bucket.
 */
export const sendToChat = (character: Character, r: RollResult) => {
  const sessionStore = useSessionStore.getState();
  let sessionId = sessionStore.activeSessionIdByMode.dnd;
  let session = sessionId ? sessionStore.sessions.find(s => s.id === sessionId) : undefined;
  if (!session) {
    sessionId = sessionStore.create({
      name: `Adventure of ${character.name}`,
      characterId: character.id,
      mode: 'dnd'
    });
    sessionStore.setActiveForMode('dnd', sessionId);
    session = sessionStore.sessions.find(s => s.id === sessionId);
  }
  useChatStore.getState().add(session!.id, {
    role: 'player',
    text: '',
    roll: r
  });
};
