import { useChatStore } from '@/state/useChatStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useSessionStore } from '@/state/useSessionStore';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useNPCStore } from '@/state/useNPCStore';
import { useUIStore } from '@/state/useUIStore';
import { buildSystemPrompt, buildRecentMessages } from '@/lib/promptBuilder';
import { primeAudio } from '@/lib/audio';
import { canSendNow, waitLabel } from '@/lib/throttle';
import { PROVIDERS } from '@/lib/providers/registry';
import type { Message, RollResult } from '@/types/message';

/**
 * Mirror of StoryTab.dispatchSend without the user-gated send() call path —
 * this is invoked from health-tab rolls and other non-typed-message triggers
 * where there IS no free-form text but we still want the DM to acknowledge
 * and narrate what just happened.
 *
 * Adds an optional player/system message, then sends the DM a short prompt
 * so they respond in context. Returns true if a send was dispatched, false if
 * no active session / API key / streaming already.
 */
export async function triggerDMResponse(opts: {
  /** The player-attached text ("I make a STR save" / "I roll a death save"). Required if `attachedRoll` not provided. */
  text?: string;
  /** Optional roll attached to the player message (saves, death saves, etc.) */
  attachedRoll?: RollResult;
  /** If true, prepend a small system message describing the trigger (used for death saves). */
  preamble?: string;
  /** Optional explicit session id; defaults to the active DND session. */
  sessionId?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const sessionStore = useSessionStore.getState();
  const activeSessionId = opts.sessionId || sessionStore.activeSessionIdByMode.dnd;
  if (!activeSessionId) return { ok: false, reason: 'No active D&D session.' };
  const activeSession = sessionStore.sessions.find(s => s.id === activeSessionId) || null;
  if (!activeSession) return { ok: false, reason: 'Session not found.' };

  const charStore = useCharacterStore.getState();
  const activeCharId = activeSession.characterId;
  const activeChar = charStore.characters.find(c => c.id === activeCharId) || null;

  const settings = useSettingsStore.getState();
  const { apiKey, provider, model } = settings;
  if (!apiKey || !model) return { ok: false, reason: 'Missing API key or model.' };

  // If the DM is already streaming for this session, queue-style: just add the
  // message; the DM will see it on the next turn. Don't double-fire streams.
  const chatStore = useChatStore.getState();
  if (chatStore.streaming[activeSessionId]) {
    pushMessage(activeSessionId, opts, activeChar?.name || 'Hero');
    return { ok: false, reason: 'DM is still responding — your roll was logged.' };
  }

  // Throttle guard (same semantics as StoryTab).
  if (!canSendNow(provider)) {
    const wait = waitLabel(provider);
    const label = PROVIDERS[provider]?.label || provider;
    return { ok: false, reason: wait ? `${label}: rate limit — wait ${wait}` : `${label}: rate limit` };
  }

  primeAudio();

  pushMessage(activeSessionId, opts, activeChar?.name || 'Hero');

  // Build the same context StoryTab does and send.
  if (!activeChar) return { ok: false, reason: 'No active character.' };
  const sessionWorld = useWorldStore.getState().worlds.find(w => w.id === activeSession.worldId) || null;
  const sessionStory = useWorldStore.getState().stories.find(s => s.id === activeSession.storyId) || null;
  const sessionNPCs = useNPCStore.getState().npcs
    .filter(n => n.sessionId === activeSession.id)
    .map(n => ({ name: n.name, role: n.role, disposition: n.disposition }));
  const summary = useChatStore.getState().summaryBySession[activeSession.id] || null;
  const currentMessages = useChatStore.getState().messagesBySession[activeSessionId] || [];

  const sys = buildSystemPrompt(activeChar, sessionWorld, sessionStory, summary, sessionNPCs);
  const recent = buildRecentMessages(currentMessages);
  const onError = (err: string) => useUIStore.getState().showToast(err, 'error');

  const result = await useChatStore.getState().send(activeSessionId, apiKey, provider, model, { system: sys, recent }, onError);
  // State deltas are applied inside useChatStore.send() itself — nothing to re-apply here.
  return { ok: !!result };
}

function pushMessage(
  sessionId: string,
  { text, attachedRoll, preamble }: { text?: string; attachedRoll?: RollResult; preamble?: string },
  characterName: string,
): void {
  const chatStore = useChatStore.getState();
  // Preamble (system) comes first so it's preserved at the top of the burst
  // and the player message plus roll line up next.
  if (preamble) {
    chatStore.add(sessionId, { role: 'system', text: preamble });
  }
  // Build a player-attached message. If only a roll is provided, we still
  // tag this as a player action so the DM sees it as their hero doing something.
  const msg: Omit<Message, 'id' | 'ts'> = {
    role: 'player',
    text: text && text.trim().length > 0 ? text.trim() : (attachedRoll ? `${characterName} rolled ${attachedRoll.label || attachedRoll.expression}.` : `${characterName} acts.`)
  };
  if (attachedRoll) msg.roll = attachedRoll;
  chatStore.add(sessionId, msg);
}
