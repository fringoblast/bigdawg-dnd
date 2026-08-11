import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSessionStore } from '@/state/useSessionStore';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useChatStore } from '@/state/useChatStore';
import { useUIStore } from '@/state/useUIStore';
import { tapSfx, pageSfx, haptics } from '@/lib/audio';

type Mode = 'list' | 'new';

export default function SessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sessions = useSessionStore(s => s.sessions);
  // Use the D&D-slot active id so chat sessions never show as ACTIVE in the story picker.
  const activeSessionId = useSessionStore(s => s.activeSessionIdByMode.dnd);
  const setActiveForMode = useSessionStore(s => s.setActiveForMode);
  const create = useSessionStore(s => s.create);
  const remove = useSessionStore(s => s.remove);
  const rename = useSessionStore(s => s.rename);
  const characters = useCharacterStore(s => s.characters);
  const setActiveChar = useCharacterStore(s => s.setActive);
  const activeCharId = useCharacterStore(s => s.activeId);
  const worlds = useWorldStore(s => s.worlds);
  const setActiveWorld = useWorldStore(s => s.setActiveWorld);
  const stories = useWorldStore(s => s.stories);
  const setActiveStory = useWorldStore(s => s.setActiveStory);
  const clearChat = useChatStore(s => s.clear);
  const showToast = useUIStore(s => s.showToast);

  const [mode, setMode] = useState<Mode>('list');
  const [name, setName] = useState('');
  const [charId, setCharId] = useState<string>(activeCharId || characters[0]?.id || '');
  const [worldId, setWorldId] = useState<string>('');
  const [storyId, setStoryId] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const activeChar = characters.find(c => c.id === activeCharId) || null;
  const charSessions = activeChar ? sessions.filter(s => s.characterId === activeChar.id) : sessions;

  const close = () => { setMode('list'); onClose(); };

  const startNew = () => {
    setMode('new');
    setName(`Adventure ${sessions.length + 1}`);
    setCharId(activeCharId || characters[0]?.id || '');
    setWorldId('');
    setStoryId('');
  };

  const confirmNew = () => {
    if (!charId) { showToast('Pick a character', 'warn'); return; }
    const id = create({ name: name.trim() || `Adventure ${sessions.length + 1}`, characterId: charId, worldId: worldId || null, storyId: storyId || null });
    setActiveChar(charId);
    if (worldId) setActiveWorld(worldId);
    if (storyId) setActiveStory(storyId);
    setActiveForMode('dnd', id);
    haptics(15);
    showToast('New adventure started', 'success');
    close();
  };

  const switchTo = (id: string) => {
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    setActiveForMode('dnd', s.id);
    setActiveChar(s.characterId);
    if (s.worldId) setActiveWorld(s.worldId);
    if (s.storyId) setActiveStory(s.storyId);
    haptics(8);
    close();
  };

  const doDelete = (id: string) => {
    if (!confirm('Delete this session? Chat history and NPC memories for this session will be lost.')) return;
    const s = sessions.find(x => x.id === id);
    if (s) clearChat(s.id);
    remove(id);
    showToast('Session deleted', 'info');
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameVal(current);
  };

  const finishRename = () => {
    if (renamingId && renameVal.trim()) {
      rename(renamingId, renameVal.trim());
    }
    setRenamingId(null);
    setRenameVal('');
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={close}
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
          className="w-full max-w-[480px] max-h-[85vh] flex flex-col rounded-2xl m-3"
          style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 p-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>{mode === 'list' ? 'Stories' : 'New Story'}</div>
            <button onClick={close} className="text-2xl leading-none">×</button>
          </div>

          {mode === 'list' && (
            <>
              {activeChar && (
                <div className="px-3 py-2 text-xs flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <span>Showing for:</span>
                  <span className="font-semibold" style={{ color: 'var(--accent)' }}>{activeChar.name}</span>
                  {characters.length > 1 && <span>· pick another hero on the Character tab to see their stories</span>}
                </div>
              )}
              <div className="overflow-y-auto p-3 space-y-2 flex-1">
                {charSessions.length === 0 ? (
                  <div className="card text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>
                    <div className="text-3xl mb-2">📜</div>
                    <div>No stories for this character yet.</div>
                    <div className="text-xs mt-1">Start a new adventure to begin.</div>
                  </div>
                ) : charSessions.map(s => {
                  const w = worlds.find(x => x.id === s.worldId);
                  const st = stories.find(x => x.id === s.storyId);
                  const isActive = s.id === activeSessionId;
                  return (
                    <div key={s.id} className="card" style={{ borderColor: isActive ? 'var(--accent)' : 'var(--border)' }}>
                      {renamingId === s.id ? (
                        <div className="flex gap-1">
                          <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && finishRename()} />
                          <button className="btn btn-primary text-xs" onClick={finishRename}>Save</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate" style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}>{s.name}</div>
                            <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                              {s.messageCount} msg · {new Date(s.updatedAt).toLocaleDateString()}
                              {w ? ` · ${w.name}` : ''}
                              {st ? ` · "${st.hook.slice(0, 40)}…"` : ''}
                            </div>
                          </div>
                          {!isActive && (
                            <button className="btn btn-primary text-xs shrink-0" onClick={() => switchTo(s.id)}>Open</button>
                          )}
                          {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>ACTIVE</span>}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2 text-[11px]">
                        <button onClick={() => startRename(s.id, s.name)} style={{ color: 'var(--text-muted)' }}>Rename</button>
                        <button onClick={() => { switchTo(s.id); showToast('Loaded as active', 'info'); }} style={{ color: 'var(--text-muted)' }}>Switch</button>
                        <button onClick={() => doDelete(s.id)} style={{ color: 'var(--danger)' }}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="sticky bottom-0 p-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <button className="btn btn-primary w-full" onClick={startNew} disabled={characters.length === 0}>
                  + New story
                </button>
                {characters.length === 0 && (
                  <p className="text-[11px] text-center mt-2" style={{ color: 'var(--text-muted)' }}>Create a hero first.</p>
                )}
              </div>
            </>
          )}

          {mode === 'new' && (
            <div className="overflow-y-auto p-3 space-y-3 flex-1">
              <div>
                <div className="label mb-1">Story name</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="The Curse of Strahd" />
              </div>
              <div>
                <div className="label mb-1">Player character</div>
                <select value={charId} onChange={e => setCharId(e.target.value)}>
                  {characters.map(c => <option key={c.id} value={c.id}>{c.name} (L{c.level} {c.race} {c.class})</option>)}
                </select>
              </div>
              <div>
                <div className="label mb-1">World <span style={{ color: 'var(--text-muted)' }}>(optional)</span></div>
                <select value={worldId} onChange={e => setWorldId(e.target.value)}>
                  <option value="">— No world (improvise) —</option>
                  {worlds.map(w => <option key={w.id} value={w.id}>{w.name} ({w.tone})</option>)}
                </select>
              </div>
              <div>
                <div className="label mb-1">Story hook <span style={{ color: 'var(--text-muted)' }}>(optional)</span></div>
                <select value={storyId} onChange={e => setStoryId(e.target.value)}>
                  <option value="">— No hook —</option>
                  {stories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="card text-xs" style={{ background: 'var(--surface-2)' }}>
                <div style={{ color: 'var(--text-muted)' }}>
                  This will start a <strong style={{ color: 'var(--accent)' }}>fresh chat</strong> with no prior memories. The same hero can be used in multiple stories — each is a separate adventure.
                </div>
              </div>
            </div>
          )}

          {mode === 'new' && (
            <div className="sticky bottom-0 p-3 border-t flex gap-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
              <button className="btn btn-ghost flex-1" onClick={() => setMode('list')}>Back</button>
              <button className="btn btn-primary flex-1" onClick={confirmNew} disabled={!charId}>Start</button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
