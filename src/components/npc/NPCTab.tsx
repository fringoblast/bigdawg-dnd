import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNPCStore } from '@/state/useNPCStore';
import { useSessionStore } from '@/state/useSessionStore';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useUIStore } from '@/state/useUIStore';
import type { NPC } from '@/types/npc';
import { tapSfx, pageSfx } from '@/lib/audio';

const DISP_COLOR: Record<string, string> = {
  friendly: '#2c8a4a',
  neutral: '#9a9a9a',
  hostile: '#a82a1a',
  unknown: 'var(--text-muted)'
};

const STATUS_BADGE: Record<NPC['status'], { label: string; bg: string; color: string }> = {
  alive: { label: 'Alive', bg: 'rgba(44, 138, 74, 0.15)', color: '#2c8a4a' },
  dead: { label: 'Deceased', bg: 'rgba(168, 42, 26, 0.15)', color: '#a82a1a' },
  unknown: { label: 'Unknown', bg: 'var(--surface-2)', color: 'var(--text-muted)' }
};

export default function NPCTab() {
  const npcs = useNPCStore(s => s.npcs);
  const update = useNPCStore(s => s.update);
  const setStatus = useNPCStore(s => s.setStatus);
  const addBackup = useNPCStore(s => s.addBackup);
  const backups = useNPCStore(s => s.backups);
  const sessions = useSessionStore(s => s.sessions);
  const characters = useCharacterStore(s => s.characters);
  const showToast = useUIStore(s => s.showToast);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'alive' | 'dead' | 'unknown'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return npcs
      .filter(n => filter === 'all' || n.status === filter)
      .filter(n => !search || n.name.toLowerCase().includes(search.toLowerCase()) || n.role.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.firstSeenAt - a.firstSeenAt);
  }, [npcs, filter, search]);

  const selected = npcs.find(n => n.id === selectedId) || null;

  if (npcs.length === 0) {
    return (
      <div className="p-4 text-center mt-8">
        <div className="text-5xl mb-3">🧙</div>
        <div className="font-display text-2xl mb-2" style={{ color: 'var(--accent)' }}>No NPCs yet</div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The DM will introduce NPCs as you play. Every time a new character appears in your story, they'll show up here.
        </p>
        <div className="card-gold text-xs mt-6 text-left max-w-sm mx-auto">
          <div className="label mb-1">How it works</div>
          <ul className="space-y-1.5" style={{ color: 'var(--text-muted)' }}>
            <li>• The DM narrates meeting a new character.</li>
            <li>• That character is auto-saved to this tab.</li>
            <li>• Tap any NPC to see full details.</li>
            <li>• Use the backup bar to save NPC data.</li>
          </ul>
        </div>
      </div>
    );
  }

  if (selected) {
    return <NPCDetail npc={selected} onBack={() => { tapSfx(); setSelectedId(null); }} onUpdate={(p) => update(selected.id, p)} onSetStatus={(s) => { setStatus(selected.id, s); showToast(`Status: ${s}`, 'info'); }} onBackup={() => { addBackup(selected.id); showToast('Backed up', 'success'); }} backupCount={backups.filter(b => b.name === selected.name).length} />;
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-display text-xl" style={{ color: 'var(--accent)' }}>NPCs</div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{npcs.length} introduced across {sessions.length} session{sessions.length === 1 ? '' : 's'}</div>
        </div>
        {backups.length > 0 && (
          <div className="text-[11px] px-2 py-1 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            {backups.length} backup{backups.length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      <input placeholder="Search by name or role…" value={search} onChange={e => setSearch(e.target.value)} className="text-sm mb-2" />

      <div className="flex gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {(['all','alive','dead','unknown'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize"
            style={{ background: filter === f ? 'var(--accent)' : 'var(--surface-2)', color: filter === f ? '#1a1a1a' : 'var(--text)' }}
          >{f}</button>
        ))}
      </div>

      <div className="space-y-1">
        {filtered.length === 0 ? (
          <div className="card text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>No matches.</div>
        ) : filtered.map(n => <NPCRow key={n.id} npc={n} onClick={() => { tapSfx(); setSelectedId(n.id); }} characterName={characters.find(c => c.id === n.characterId)?.name} sessionName={sessions.find(s => s.id === n.sessionId)?.name} />)}
      </div>
    </div>
  );
}

const NPCRow = ({ npc, onClick, characterName, sessionName }: { npc: NPC; onClick: () => void; characterName?: string; sessionName?: string }) => {
  const dispColor = DISP_COLOR[npc.disposition] || DISP_COLOR.unknown;
  return (
    <button onClick={onClick} className="card w-full text-left flex items-center gap-2 text-sm">
      <div className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm shrink-0" style={{ background: 'var(--surface-2)', border: `2px solid ${dispColor}` }}>
        {npc.name[0]?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate flex items-center gap-1">
          {npc.name}
          {npc.status === 'dead' && <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(168, 42, 26, 0.2)', color: '#a82a1a' }}>†</span>}
        </div>
        <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{npc.role}</div>
        <div className="text-[10px] flex items-center gap-1 mt-0.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dispColor }} />
          <span style={{ color: dispColor }} className="capitalize">{npc.disposition}</span>
          {characterName && <span style={{ color: 'var(--text-muted)' }}>· {characterName}</span>}
          {sessionName && <span style={{ color: 'var(--text-muted)' }}>· {sessionName}</span>}
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
};

const NPCDetail = ({ npc, onBack, onUpdate, onSetStatus, onBackup, backupCount }: { npc: NPC; onBack: () => void; onUpdate: (p: Partial<NPC>) => void; onSetStatus: (s: NPC['status']) => void; onBackup: () => void; backupCount: number }) => {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(npc.notes || '');
  const dispColor = DISP_COLOR[npc.disposition] || DISP_COLOR.unknown;
  const status = STATUS_BADGE[npc.status];

  const exportNPC = () => {
    const blob = new Blob([JSON.stringify(npc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `npc-${npc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveNotes = () => {
    onUpdate({ notes });
    setEditingNotes(false);
  };

  return (
    <div className="p-3 pb-24">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="text-sm" style={{ color: 'var(--accent)' }}>← Back</button>
      </div>

      <div className="card-gold text-center mb-3">
        <div className="w-20 h-20 rounded-full flex items-center justify-center font-display font-bold text-3xl mx-auto" style={{ background: 'var(--surface-2)', border: `3px solid ${dispColor}` }}>
          {npc.name[0]?.toUpperCase() || '?'}
        </div>
        <div className="font-display text-xl mt-2" style={{ color: 'var(--accent)' }}>{npc.name}</div>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{npc.role}</div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: `${dispColor}22`, color: dispColor }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: dispColor }} />
            {npc.disposition}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: status.bg, color: status.color }}>{status.label}</span>
        </div>
      </div>

      <div className="card mb-3">
        <div className="label mb-2">Dropdown · Who they are</div>
        <div className="space-y-2 text-sm">
          {npc.race && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Race</span>
              <span className="font-semibold">{npc.race}</span>
            </div>
          )}
          {npc.location && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>First met at</span>
              <span className="font-semibold">{npc.location}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Introduced</span>
            <span className="font-semibold">{new Date(npc.firstSeenAt).toLocaleString()}</span>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }} className="mb-1">Description</div>
            <div className="text-sm leading-relaxed">{npc.description || <em style={{ color: 'var(--text-muted)' }}>No description yet</em>}</div>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="label">What they're like</div>
          <button onClick={() => setEditingNotes(!editingNotes)} className="text-[11px]" style={{ color: 'var(--accent)' }}>{editingNotes ? 'Cancel' : 'Edit'}</button>
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Personality, motivations, secrets, mannerisms…" />
            <button className="btn btn-primary text-xs w-full" onClick={saveNotes}>Save</button>
          </div>
        ) : (
          <div className="text-sm leading-relaxed" style={{ color: npc.notes ? 'var(--text)' : 'var(--text-muted)' }}>
            {npc.notes || 'Tap Edit to add personality notes.'}
          </div>
        )}
      </div>

      {npc.messagePreview && (
        <details className="card mb-3">
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--accent)' }}>First appearance</summary>
          <div className="text-[11px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>"{npc.messagePreview}"</div>
        </details>
      )}

      <div className="card mb-3">
        <div className="label mb-2">Status</div>
        <div className="grid grid-cols-3 gap-1">
          {(['alive','dead','unknown'] as const).map(s => (
            <button
              key={s}
              onClick={() => onSetStatus(s)}
              className="py-1.5 rounded text-xs font-semibold capitalize"
              style={{ background: npc.status === s ? 'var(--accent)' : 'var(--surface-2)', color: npc.status === s ? '#1a1a1a' : 'var(--text)' }}
            >{s}</button>
          ))}
        </div>
      </div>

      <BackupBar onBackup={onBackup} onExport={exportNPC} backupCount={backupCount} />
    </div>
  );
};

const BackupBar = ({ onBackup, onExport, backupCount }: { onBackup: () => void; onExport: () => void; backupCount: number }) => (
  <motion.div
    initial={{ y: 40, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    className="fixed left-0 right-0 mx-auto z-30 flex justify-center"
    style={{ bottom: 80, pointerEvents: 'none' }}
  >
    <div
      className="flex items-center gap-1 px-2 py-1.5 rounded-full"
      style={{ background: 'var(--bg)', border: '1px solid var(--accent)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', pointerEvents: 'auto' }}
    >
      <button onClick={onBackup} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.1)' }} title="Save NPC to backup">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
        <span style={{ color: 'var(--accent)' }}>Backup</span>
        {backupCount > 0 && <span className="text-[10px] px-1 rounded-full" style={{ background: 'var(--accent)', color: '#1a1a1a' }}>{backupCount}</span>}
      </button>
      <div className="w-px h-5" style={{ background: 'var(--border)' }} />
      <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'var(--surface-2)' }} title="Export NPC as JSON">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text)' }}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        <span>Export</span>
      </button>
    </div>
  </motion.div>
);
