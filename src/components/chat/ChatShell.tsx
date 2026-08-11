import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useChatStore } from '@/state/useChatStore';
import { useSessionStore, CHAT_MODE_CHAR } from '@/state/useSessionStore';
import { useUIStore } from '@/state/useUIStore';
import { PROVIDERS, PROVIDER_IDS } from '@/lib/providers/registry';
import { isCustomProviderId } from '@/lib/providers/custom';
import { buildChatSystemPrompt, buildRecentMessages } from '@/lib/promptBuilder';
import { tapSfx, haptics, primeAudio } from '@/lib/audio';
import { canSendNow, waitLabel } from '@/lib/throttle';
import MessageBubble from '@/components/story/MessageBubble';
import TypingIndicator from '@/components/story/TypingIndicator';
import type { Message } from '@/types/message';

export default function ChatShell() {
  const apiKey = useSettingsStore(s => s.apiKey);
  const chatProvider = useSettingsStore(s => s.chatProvider);
  const chatModel = useSettingsStore(s => s.chatModel);
  const setChatProvider = useSettingsStore(s => s.setChatProvider);
  const customProviders = useSettingsStore(s => s.customProviders);
  const activeCustom = customProviders.find(c => c.id === chatProvider);
  const providerMeta = activeCustom
    ? { label: activeCustom.label, requiresKey: false, modelListNote: '' }
    : PROVIDERS[chatProvider];

  const sessions = useSessionStore(s => s.forMode('chat'));
  // Read the chat-slot active session id directly so D&D sessions never leak into chat mode.
  const activeSessionId = useSessionStore(s => s.activeSessionIdByMode.chat);
  const active = useSessionStore(s => {
    const id = s.activeSessionIdByMode.chat;
    return id ? (s.sessions.find(x => x.id === id) || null) : null;
  });
  const createSession = useSessionStore(s => s.create);
  const setActiveForMode = useSessionStore(s => s.setActiveForMode);
  const removeSession = useSessionStore(s => s.remove);
  const renameSession = useSessionStore(s => s.rename);
  const clearChat = useChatStore(s => s.clear);
  const send = useChatStore(s => s.send);
  const add = useChatStore(s => s.add);
  const fetchModels = useChatStore(s => s.fetchModels);
  const modelsByProvider = useChatStore(s => s.modelsByProvider);
  const chatModelList = modelsByProvider[chatProvider]?.list || [];
  const setChatModel = useSettingsStore(s => s.setChatModel);
  const streaming = useChatStore(s => active?.id ? !!s.streaming[active.id] : false);
  const messages = useChatStore(s => active?.id ? (s.messagesBySession[active.id] || []) : []);
  const showToast = useUIStore(s => s.showToast);
  const openSettings = useUIStore(s => s.openSettings);

  const [input, setInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-pick the active session: most-recently-updated chat session.
  useEffect(() => {
    if (sessions.length === 0) {
      // Don't clear an already-active session just because the filter result is empty
      // — but DO clear the chat slot if the active session has actually been deleted.
      if (active && !sessions.some(s => s.id === active.id)) {
        setActiveForMode('chat', null);
      }
      return;
    }
    if (active && (active.mode || 'dnd') === 'chat' && sessions.some(s => s.id === active.id)) return;
    setActiveForMode('chat', sessions[0].id);
  }, [sessions.length, active?.id, setActiveForMode]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, streaming]);

  // Keep the chat-model dropdown populated whenever (chatProvider, apiKey) change.
  // Pollinations ignores the key entirely — so this populates the curated list so the user can
  // see and switch between openai-fast, mistral, etc.
  useEffect(() => {
    const needsKey = activeCustom ? false : PROVIDERS[chatProvider]?.requiresKey ?? false;
    if (!needsKey || apiKey) {
      fetchModels(chatProvider, activeCustom ? activeCustom.apiKey : apiKey || '').catch(() => {});
    }
  }, [chatProvider, apiKey, fetchModels, activeCustom]);

  const newChat = () => {
    primeAudio();
    tapSfx();
    haptics(10);
    const id = createSession({ name: `Chat ${sessions.length + 1}`, characterId: CHAT_MODE_CHAR, mode: 'chat' });
    setActiveForMode('chat', id);
  };

  const onSend = async () => {
    const body = input.trim();
    if (!body || !active) return;
    if (!activeCustom && providerMeta.requiresKey && !apiKey) {
      showToast('Add an API key in Settings for this provider, or switch to Pollinations.', 'warn');
      openSettings();
      return;
    }
    if (!canSendNow(chatProvider)) {
      const w = waitLabel(chatProvider);
      showToast(w ? `${providerMeta.label}: rate limit — wait ${w}` : `${providerMeta.label}: rate limit`, 'warn');
      return;
    }
    add(active.id, { role: 'player', text: body });
    setInput('');
    const system = buildChatSystemPrompt(providerMeta.label);
    const recent = buildRecentMessages([...messages, { id: 'tmp', ts: Date.now(), role: 'player', text: body } as Message]);
    const result = await send(active.id, providerMeta.requiresKey ? apiKey : '', chatProvider, chatModel, { system, recent }, (err) => showToast(err, 'error'));
    if (result === null) {
      // already toasted by send()
    }
  };

  const onPick = (id: string) => {
    tapSfx();
    setActiveForMode('chat', id);
  };

  const onDelete = (id: string) => {
    if (!confirm('Delete this chat and its history?')) return;
    clearChat(id);
    removeSession(id);
    showToast('Chat deleted', 'info');
  };

  const startRename = () => {
    if (!active) return;
    setRenaming(true);
    setRenameVal(active.name);
  };

  const finishRename = () => {
    if (active && renameVal.trim()) renameSession(active.id, renameVal.trim());
    setRenaming(false);
    setRenameVal('');
  };

  const providerChip = useMemo(() => `${providerMeta.label} · ${chatModel}`, [providerMeta.label, chatModel]);

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      <aside
        className="hidden sm:flex flex-col border-r shrink-0"
        style={{ width: 240, borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Conversations</div>
          <button onClick={newChat} className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>+ New</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {sessions.length === 0 ? (
            <div className="p-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>No chats yet. Tap “+ New”.</div>
          ) : sessions.map(s => {
            const isActive = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                className="w-full text-left px-3 py-2.5 border-b flex items-center gap-2"
                style={{ borderColor: 'var(--border)', background: isActive ? 'rgba(212,175,55,0.14)' : 'transparent' }}
              >
                <div className="w-6 h-6 rounded shrink-0 flex items-center justify-center font-mono text-[10px] font-bold" style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>›</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}>{s.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.messageCount} msg · {new Date(s.updatedAt).toLocaleDateString()}</div>
                </div>
                {isActive && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--surface-2)', color: 'var(--danger)' }}
                    title="Delete chat"
                  >×</button>
                )}
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          Chat mode uses <span style={{ color: 'var(--accent)' }}>{providerMeta.label}</span> and is completely separate from your D&D character.
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {renaming && active ? (
            <>
              <input
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && finishRename()}
                className="flex-1"
              />
              <button className="btn btn-primary text-xs" onClick={finishRename}>Save</button>
              <button className="btn btn-ghost text-xs" onClick={() => setRenaming(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button
                onClick={newChat}
                className="sm:hidden text-xs px-2 py-1 rounded-full font-bold"
                style={{ background: 'var(--accent)', color: '#1a1a1a' }}
              >+ New</button>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate" style={{ color: 'var(--accent)' }}>{active?.name || 'New chat'}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{providerChip}</div>
              </div>
              {active && (
                <>
                  <button onClick={startRename} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>Rename</button>
                  <button onClick={() => onDelete(active.id)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--danger)' }}>Delete</button>
                </>
              )}
              <select
                value={chatProvider}
                onChange={e => setChatProvider(e.target.value as any)}
                className="text-xs py-1 px-1 max-w-[140px]"
                title="Chat provider"
              >
                {PROVIDER_IDS.map(id => (
                  <option key={id} value={id}>{PROVIDERS[id].label}</option>
                ))}
                {customProviders.filter(c => isCustomProviderId(c.id)).map(c => (
                  <option key={c.id} value={c.id}>✦ {c.label}</option>
                ))}
              </select>
              <select
                value={chatModel}
                onChange={e => setChatModel(e.target.value)}
                className="text-xs py-1 px-1 max-w-[160px]"
                title="Chat model"
              >
                {chatModelList.length === 0
                  ? <option value={chatModel}>{chatModel}</option>
                  : chatModelList.map(m => (
                      <option key={m.id} value={m.id}>{m.name || m.id}</option>
                    ))}
              </select>
            </>
          )}
        </div>

        <div ref={scrollerRef} className="scroll-area px-3 py-3 flex-1">
          {!active ? (
            <div className="text-center mt-12 px-4">
              <div className="font-display text-3xl font-bold mb-2" style={{ color: 'var(--accent)' }}>Standalone Chat</div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>A clean AI chat interface with zero D&D state.</p>
              <button className="btn btn-primary mt-4" onClick={newChat}>+ Start a new chat</button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center mt-16 px-4">
              <div className="text-5xl mb-3">💬</div>
              <div className="font-display text-2xl font-semibold mb-1" style={{ color: 'var(--accent)' }}>Say hi</div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Send the AI anything. Carefully crafted prose, code, brainstorming, lists — whatever.
                This thread is independent of your D&D hero.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 max-w-md mx-auto">
                <button className="btn btn-ghost text-xs" onClick={() => setInput('Draft a short d20 adventure hook set in a haunted lighthouse.')}>Haunted lighthouse hook</button>
                <button className="btn btn-ghost text-xs" onClick={() => setInput('Write a Python function that flattens a nested list of integers.')}>Flatten nested list</button>
                <button className="btn btn-ghost text-xs" onClick={() => setInput('Help me plan a one-week trip to Kyoto, hitting temples, food, and one quiet day.')}>Kyoto in one week</button>
                <button className="btn btn-ghost text-xs" onClick={() => setInput('Explain 5e surprise rules in 3 short bullets.')}>5e surprise in 3 bullets</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map(m => <MessageBubble key={m.id} message={m} character={null} />)}
              {streaming && messages[messages.length - 1]?.pending && <TypingIndicator text="Thinking…" />}
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-t shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder={active ? 'Send a message…' : 'Start a chat to begin…'}
              rows={1}
              disabled={!active}
              className="flex-1 resize-none"
              style={{ maxHeight: 140 }}
            />
            {streaming ? (
              <button className="btn btn-danger shrink-0" onClick={() => active && useChatStore.getState().stop(active.id)}>Stop</button>
            ) : (
              <button
                className="btn btn-primary shrink-0"
                onClick={onSend}
                disabled={!active || !input.trim()}
                style={{ opacity: (!active || !input.trim()) ? 0.4 : 1 }}
              >Send</button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
