import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useChatStore } from '@/state/useChatStore';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useUIStore } from '@/state/useUIStore';
import { useRollStore } from '@/state/useRollStore';
import { useNPCStore } from '@/state/useNPCStore';
import { useSessionStore } from '@/state/useSessionStore';
import { buildSystemPrompt, buildRecentMessages } from '@/lib/promptBuilder';
import { rollExpression } from '@/lib/diceEngine';
import { primeAudio, tapSfx, haptics, setAmbientMood, stopAmbient, detectAmbientMood } from '@/lib/audio';
import { sceneUrl, fetchImageAsBlob } from '@/lib/pollinations';
import { canSendNow, waitLabel } from '@/lib/throttle';
import { PROVIDERS } from '@/lib/providers/registry';
import { pickWritingPhrase } from '@/lib/tones';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import ImageUploader from './ImageUploader';
import SessionSheet from './SessionSheet';
import type { RollResult, Message } from '@/types/message';

// Recognise the player's escape phrase for god-mode revival.
const LIVE_ESCAPE_RE = /(i\s+(?:wanna|want(?: to)?|choose to)\s+live\s+anyways?|i\s+live\s+anyways?|i\s+live\s+anyway)/i;

export default function StoryTab() {
  const activeChar = useCharacterStore(s => s.active());
  const activeWorld = useWorldStore(s => s.activeWorld());
  const activeStory = useWorldStore(s => s.activeStory());
  // Pull the active session from the DND slot so chat-mode sessions never leak into the story view.
  const activeSession = useSessionStore(s => {
    const id = s.activeSessionIdByMode.dnd;
    return id ? (s.sessions.find(x => x.id === id) || null) : null;
  });
  const sessionMessages = useChatStore(s => activeSession ? (s.messagesBySession[activeSession.id] || []) : []);
  const summary = useChatStore(s => activeSession ? s.summaryBySession[activeSession.id] : undefined);
  const send = useChatStore(s => s.send);
  const stop = useChatStore(s => s.stop);
  const add = useChatStore(s => s.add);
  const addRoll = useRollStore(s => s.add);
  const apiKey = useSettingsStore(s => s.apiKey);
  const model = useSettingsStore(s => s.model);
  const provider = useSettingsStore(s => s.provider);
  const appMode = useSettingsStore(s => s.appMode);
  const revive = useCharacterStore(s => s.revive);
  const setTab = useUIStore(s => s.setTab);
  const showToast = useUIStore(s => s.showToast);
  const npcs = useNPCStore(s => s.npcs);

  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string>('');
  const [phraseSituation, setPhraseSituation] = useState<'default' | 'combat' | 'exploration' | 'social'>('default');
  const streaming = useChatStore(s => activeSession ? !!s.streaming[activeSession.id] : false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);
  const customProviders = useSettingsStore(s => s.customProviders);
  const customCfg = customProviders.find(c => c.id === provider);
  const customIsAnthropic = !!customCfg && customCfg.type === 'anthropic';
  const supportsVision = !customIsAnthropic && provider !== 'groq' && provider !== 'cerebras' && provider !== 'pollinations';

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [sessionMessages.length, streaming]);

  useEffect(() => {
    if (!streaming) return;
    const interval = setInterval(() => setPhrase(pickWritingPhrase(phraseSituation)), 2400);
    setPhrase(pickWritingPhrase(phraseSituation));
    return () => clearInterval(interval);
  }, [streaming, phraseSituation]);

  const effectiveKey = customCfg ? customCfg.apiKey : apiKey;
  const needsKey = customCfg ? false : (PROVIDERS[provider]?.requiresKey ?? true);
  const canSend = !!activeSession && (!needsKey || !!effectiveKey) && (text.trim().length > 0 || (!!pendingImage && supportsVision));

  // v0.6 — AI scene art backdrop. Toggleable. URL stored on a ref so we don't re-render on idempotent updates.
  const aiBackgrounds = useSettingsStore(s => s.aiBackgrounds);
  const ambientMusic = useSettingsStore(s => s.ambientMusic);
  const [sceneArtUrl, setSceneArtUrl] = useState<string | null>(null);
  const [sceneArtBusy, setSceneArtBusy] = useState(false);
  const lastSceneKey = useRef<string>('');

  // Auto-derive mood from world tone + latest DM text and start/stop ambient accordingly.
  useEffect(() => {
    if (!ambientMusic || appMode !== 'dnd') {
      stopAmbient();
      return;
    }
    const last = sessionMessages.filter(m => m.role === 'dm').slice(-1)[0];
    const mood = detectAmbientMood(last?.text || '', activeWorld?.tone);
    setAmbientMood(mood === 'off' ? 'default' : mood);
    return () => { /* keep playing across re-renders */ };
  }, [ambientMusic, appMode, sessionMessages.length, activeWorld?.tone]);

  // Stop ambient the moment the user leaves the story tab or switches to chat.
  useEffect(() => {
    return () => { stopAmbient(); };
  // Mount/unmount; agent already handles in-tab transitions via the dedicated effect above.
  // We deliberately re-run only when the tab/mode identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateSceneArt = async (force?: boolean) => {
    if (!aiBackgrounds) return;
    const last = [...sessionMessages].reverse().find(m => m.role === 'dm');
    const lastText = last?.text || activeStory?.hook || activeWorld?.summary || '';
    const key = (activeWorld?.tone || 'default') + '|' + lastText.slice(0, 80);
    if (!force && lastSceneKey.current === key && sceneArtUrl) return;
    lastSceneKey.current = key;
    setSceneArtBusy(true);
    try {
      const character = activeChar;
      const characterTraits = character ? `${character.race} ${character.class}` : '';
      const url = sceneUrl({
        tone: activeWorld?.tone || 'classic',
        locationHint: lastText.match(/enter[^\.\?]+|arrive at[^\.\?]+|step into[^\.\?]+/i)?.[0] || activeWorld?.summary?.slice(0, 60),
        recentNarration: lastText.slice(0, 240),
        characterTraits,
        variant: force ? Math.floor(Math.random() * 1000) : 0
      }, { keepSeed: !force, width: 1280, height: 768 });
      // Warm up the cache by hitting the URL — if it fails, fall back to allowing <img src> to handle it lazily.
      fetchImageAsBlob(url).catch(() => undefined);
      setSceneArtUrl(url);
    } finally {
      setSceneArtBusy(false);
    }
  };

  // Auto-refresh the scene art when either the world's tone flips or the latest DM line changes.
  useEffect(() => {
    if (!aiBackgrounds) { setSceneArtUrl(null); return; }
    const last = sessionMessages.filter(m => m.role === 'dm').slice(-1)[0];
    void generateSceneArt(false);
  // Depend only on length/tone (text comparison handled inside generateSceneArt).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiBackgrounds, activeWorld?.tone, sessionMessages.length]);

  const dispatchSend = async (body: string, image?: string) => {
    if (!activeChar || !activeSession) {
      showToast('Create a character and a session first', 'warn');
      setTab('character');
      return;
    }
    // Defensive: if the active session somehow isn't a D&D session, fall back to the dnd slot.
    if (activeSession.mode === 'chat') {
      const fallback = useSessionStore.getState().sessions.find(s => (s.mode || 'dnd') === 'dnd' && s.characterId === activeChar.id);
      if (fallback) useSessionStore.getState().setActiveForMode('dnd', fallback.id);
      else {
        showToast('Create a new adventure to continue', 'warn');
        return;
      }
    }
    const cfgForCurrent = useSettingsStore.getState().customProviders.find(c => c.id === provider);
    // Keyless providers (Pollinations) or anything carrying its own key must never block.
    const needsSharedKey = !cfgForCurrent && (PROVIDERS[provider]?.requiresKey ?? true);
    if (needsSharedKey && !apiKey) {
      showToast(`Add your ${PROVIDERS[provider]?.label || provider} API key in Settings`, 'warn');
      useUIStore.getState().openSettings();
      return;
    }
    if (!body.trim() && !image) return;
    primeAudio();

    if (!canSendNow(provider)) {
      const w = waitLabel(provider);
      const label = PROVIDERS[provider]?.label || provider;
      showToast(w ? `${label}: rate limit — wait ${w}` : `${label}: rate limit`, 'warn');
      return;
    }

    // ---- Escape phrase: god-mode revival -----------------------------
    const matched = body.trim().match(LIVE_ESCAPE_RE);
    if (matched) {
      revive(activeChar.id, 1);
      add(activeSession.id, { role: 'system', text: '🪄 Player chose to live. Death saves cleared, HP restored to 1.' });
      showToast('Revived. HP = 1.', 'success');
    }
    // ------------------------------------------------------------------

    // Persist the player's literal text in chat. The AI will infer the revival
    // from the system message above + the character's refreshed HP/Revived state
    // in the prompt — no need to leak a `[System:…]` line into the user-visible bubble.
    const msg: Omit<Message, 'id' | 'ts'> = { role: 'player', text: body };
    if (image) msg.image = image;
    add(activeSession.id, msg);
    setText('');

    const sessionWorld = useWorldStore.getState().worlds.find(w => w.id === activeSession.worldId) || null;
    const sessionStory = useWorldStore.getState().stories.find(s => s.id === activeSession.storyId) || null;
    const sessionNPCs = npcs.filter(n => n.sessionId === activeSession.id).map(n => ({ name: n.name, role: n.role, disposition: n.disposition }));

    const sys = buildSystemPrompt(activeChar, sessionWorld, sessionStory, summary || null, sessionNPCs);
    const recent = buildRecentMessages([...sessionMessages, { ...msg, id: 'tmp', ts: Date.now() } as Message]);
    setPhraseSituation(detectSituation(body));

    const result = await send(activeSession.id, apiKey, provider, model, { system: sys, recent }, (err) => showToast(err, 'error'));
    // Delta application already happened inside useChatStore.send() — here we only toast.
    if (result?.delta) {
      const changes = describeDelta(result.delta);
      if (changes) showToast(changes, 'success', 4000);
    }
  };

  const sendMessage = () => {
    const body = text.trim();
    const img = pendingImage || undefined;
    setPendingImage(null);
    dispatchSend(body, img);
  };

  const sendChoice = (choice: string) => {
    dispatchSend(choice, undefined);
  };

const onRollRequest = (expression: string, label: string) => {
    if (streaming) return;
    const roll = rollExpression(expression, label || expression);
    addRoll(roll);
    if (activeSession) add(activeSession.id, { role: 'player', text: '', roll });
    primeAudio(); haptics(10);
    dispatchSend(`I rolled ${roll.total} (${roll.label || expression}).`, undefined);
  };

  const detectSituation = (t: string): 'default' | 'combat' | 'exploration' | 'social' => {
    const x = t.toLowerCase();
    if (/\b(attack|fight|slash|kill|combat|initiative|swing)\b/.test(x)) return 'combat';
    if (/\b(door|hall|cave|forest|search|explore|room|path)\b/.test(x)) return 'exploration';
    if (/\b(talk|persuade|deceive|intimididation|bargain|merchant|bard)\b/.test(x)) return 'social';
    return 'default';
  };

  const rollFor = (label: string, expression: string) => {
    if (!activeSession) return;
    const r = rollExpression(expression, label);
    addRoll(r);
    add(activeSession.id, { role: 'player', text: '', roll: r });
    haptics(15);
  };

  const empty = !sessionMessages.length;

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={() => { tapSfx(); setSessionSheetOpen(true); }}
        className="px-3 py-2 flex items-center gap-2 text-sm border-b active:opacity-70 shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        <span className="font-semibold truncate flex-1 text-left" style={{ color: 'var(--accent)' }}>{activeSession?.name || 'No session'}</span>
        {activeChar && <span className="text-[10px] truncate max-w-[40%]" style={{ color: 'var(--text-muted)' }}>· {activeChar.name}</span>}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>⇄</span>
      </button>

      <div className="relative flex-1 min-h-0 flex flex-col">
        {sceneArtUrl && aiBackgrounds && (
          <div
            key={sceneArtUrl /* remount on URL change so sceneArtFadeIn replays on each 🎨 BG tap */}
            className="scene-art-layer"
            aria-hidden="true"
            style={{ backgroundImage: `url(${sceneArtUrl})` }}
          />
        )}
        {sceneArtUrl && aiBackgrounds && (
          <div className="scene-art-veil" aria-hidden="true" />
        )}
        <div ref={scrollerRef} className="scroll-area px-3 py-3" style={{ position: 'relative', zIndex: 1 }}>
          {empty ? (
            <div className="text-center mt-12 px-4">
              <div className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--accent)' }}>Your story begins…</div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {activeSession
                  ? `Tell the DM what ${activeChar?.name || 'your hero'} does, or ask a question. The world awaits.`
                  : 'Tap the session bar above to start a new adventure.'}
              </p>
              {!activeSession && (
                <button className="btn btn-primary mt-4" onClick={() => setSessionSheetOpen(true)}>
                  + Start a new story
                </button>
              )}
              {activeSession && activeChar && (
                <div className="mt-6 grid grid-cols-2 gap-2 max-w-sm mx-auto">
                  <button className="btn btn-ghost text-xs" onClick={() => setText('I look around the room, taking in my surroundings.')}>Look around</button>
                  <button className="btn btn-ghost text-xs" onClick={() => setText('I introduce myself to the nearest person.')}>Introduce myself</button>
                  <button className="btn btn-ghost text-xs" onClick={() => setText('I draw my weapon and hold it ready.')}>Draw weapon</button>
                  <button className="btn btn-ghost text-xs" onClick={() => setText('I ask the barkeep for any rumors worth hearing.')}>Ask for rumors</button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sessionMessages.map(m => <MessageBubble key={m.id} message={m} character={activeChar} onChoiceSelect={sendChoice} onRollRequest={onRollRequest} />)}
              {streaming && sessionMessages[sessionMessages.length - 1]?.pending && (
                <TypingIndicator text={phrase} />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-t shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {activeChar && activeSession && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {aiBackgrounds && (
              <button
                className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold"
                style={{ background: sceneArtBusy ? 'var(--accent)' : 'var(--surface-2)', color: sceneArtBusy ? '#1a1a1a' : 'var(--accent)', border: '1px solid var(--border)' }}
                onClick={() => { tapSfx(); haptics(8); void generateSceneArt(true); }}
                disabled={sceneArtBusy}
                title="Generate a fresh AI background for the current scene"
              >
                {sceneArtBusy ? '🎨 …' : '🎨 BG'}
              </button>
            )}
            <button className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--border)' }} onClick={() => rollFor('d20', 'd20')}>🎲 d20</button>
            <button className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => rollFor('d6', 'd6')}>d6</button>
            <button className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => rollFor('d4', 'd4')}>d4</button>
            <button className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => rollFor('d8', 'd8')}>d8</button>
            <button className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => rollFor('d10', 'd10')}>d10</button>
            <button className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => rollFor('d12', 'd12')}>d12</button>
            <button className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-full font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => rollFor('d100', 'd100')}>d100</button>
          </div>
        )}
        {pendingImage && (
          <div className="mb-2 relative inline-block">
            <img src={pendingImage} className="w-20 h-20 object-cover rounded-lg border" style={{ borderColor: 'var(--accent)' }} alt="pending" />
            <button className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-xs font-bold" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => setPendingImage(null)}>×</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {supportsVision ? (
            <ImageUploader onImage={setPendingImage} />
          ) : (
            <div
              className="shrink-0 px-2 h-9 flex items-center justify-center rounded-lg text-[10px]"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              title="Image input disabled for this provider"
            >
              🖼︎ —
            </div>
          )}
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={activeSession ? `What does ${activeChar?.name || 'your hero'} do?` : 'Start a new story first…'}
            rows={1}
            disabled={!activeSession}
            className="flex-1 resize-none"
            style={{ maxHeight: 120 }}
          />
          {streaming ? (
            <button className="btn btn-danger shrink-0" onClick={() => activeSession && stop(activeSession.id)}>Stop</button>
          ) : (
            <button
              className="btn btn-primary shrink-0"
              onClick={() => { tapSfx(); haptics(10); sendMessage(); }}
              disabled={!canSend}
              style={{ opacity: canSend ? 1 : 0.4 }}
            >
              Send
            </button>
          )}
        </div>
      </div>

      <SessionSheet open={sessionSheetOpen} onClose={() => setSessionSheetOpen(false)} />
    </div>
  );
}

const describeDelta = (d: import('@/types/message').StateDelta): string => {
  const parts: string[] = [];
  if (typeof d.hpDelta === 'number') parts.push(d.hpDelta >= 0 ? `+${d.hpDelta} HP` : `${d.hpDelta} HP`);
  if (typeof d.tempHpDelta === 'number' && d.tempHpDelta > 0) parts.push(`+${d.tempHpDelta} temp`);
  if (typeof d.exp === 'number' && d.exp > 0) parts.push(`+${d.exp} XP`);
  if (d.levelUp) parts.push('⭐ Level up!');
  if (d.currencyDelta) {
    for (const k of ['cp','sp','ep','gp','pp'] as const) {
      const v = d.currencyDelta[k];
      if (typeof v === 'number' && v !== 0) parts.push(`${v >= 0 ? '+' : ''}${v} ${k.toUpperCase()}`);
    }
  }
  if (d.itemsAdd?.length) parts.push(`+${d.itemsAdd.map(i => i.name).join(', ')}`);
  if (d.itemsRemove?.length) parts.push(`-${d.itemsRemove.map(i => i.name).join(', ')}`);
  if (d.conditionsAdd?.length) parts.push(`buff: ${d.conditionsAdd.map(c => c.name).join(', ')}`);
  if (d.conditionsRemove?.length) parts.push(`cleared: ${d.conditionsRemove.join(', ')}`);
  if (d.npcsIntroduced?.length) parts.push(`+NPC: ${d.npcsIntroduced.map(n => n.name).join(', ')}`);
  return parts.slice(0, 4).join(' · ');
};
