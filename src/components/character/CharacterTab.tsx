import { useState } from 'react';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useChatStore } from '@/state/useChatStore';
import { useSessionStore } from '@/state/useSessionStore';
import { useUIStore } from '@/state/useUIStore';
import { useNPCStore } from '@/state/useNPCStore';
import CharacterCreator from './CharacterCreator';
import CharacterSheet from './CharacterSheet';
import HealthView from './HealthView';
import NPCTab from '@/components/npc/NPCTab';
import { tapSfx } from '@/lib/audio';

type SubTab = 'health' | 'hero' | 'npcs';

export default function CharacterTab() {
  const characters = useCharacterStore(s => s.characters);
  const activeId = useCharacterStore(s => s.activeId);
  const setActive = useCharacterStore(s => s.setActive);
  const remove = useCharacterStore(s => s.remove);
  const showToast = useUIStore(s => s.showToast);
  const npcCount = useNPCStore(s => s.npcs.filter(n => n.characterId === activeId).length);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sub, setSub] = useState<SubTab>('health');
  const [pickingHero, setPickingHero] = useState(false);

  const active = characters.find(c => c.id === activeId) || null;
  const editing = editingId ? (characters.find(c => c.id === editingId) || null) : null;

  if (creating) {
    return <CharacterCreator onDone={() => setCreating(false)} />;
  }
  if (editing) {
    return <CharacterCreator prefill={editing} onDone={(saved) => { setEditingId(null); if ((saved as any)?.updated) showToast(`${editing.name} updated`, 'success'); }} />;
  }

  if (active && !pickingHero) {
    return (
      <div>
        <SubNav sub={sub} setSub={setSub} npcCount={npcCount} onPickHero={() => { tapSfx(); setPickingHero(true); }} />
        {sub === 'health' && <HealthView character={active} />}
        {sub === 'hero' && <CharacterSheet character={active} onEdit={() => setEditingId(active.id)} />}
        {sub === 'npcs' && <NPCTab />}
      </div>
    );
  }

  if (pickingHero && active) {
    return (
      <div>
        <div className="p-3 flex items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <button onClick={() => setPickingHero(false)} className="text-sm" style={{ color: 'var(--accent)' }}>← Back to {active.name}</button>
        </div>
        <HeroList
          characters={characters}
          activeId={activeId}
          onPlay={id => { setActive(id); setPickingHero(false); }}
          onRemove={id => { if (confirm('Delete this character?')) { remove(id); showToast('Deleted', 'info'); } }}
          onCreate={() => setCreating(true)}
        />
      </div>
    );
  }

  return (
    <HeroList
      characters={characters}
      activeId={activeId}
      onPlay={id => setActive(id)}
      onRemove={id => { if (confirm('Delete this character?')) { remove(id); showToast('Deleted', 'info'); } }}
      onCreate={() => setCreating(true)}
    />
  );
}

const SubNav = ({ sub, setSub, npcCount, onPickHero }: { sub: SubTab; setSub: (s: SubTab) => void; npcCount: number; onPickHero: () => void }) => {
  const activeName = useCharacterStore(s => s.characters.find(c => c.id === s.activeId)?.name || '');
  return (
    <div className="sticky top-0 z-20" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <button onClick={onPickHero} className="text-xs flex items-center gap-1 truncate" style={{ color: 'var(--text-muted)' }}>
          <span>Playing as</span>
          <span className="font-semibold truncate" style={{ color: 'var(--accent)' }}>{activeName}</span>
          <span>↻</span>
        </button>
      </div>
      <div className="flex">
        <SubButton active={sub === 'health'} onClick={() => { tapSfx(); setSub('health'); }}>Health</SubButton>
        <SubButton active={sub === 'hero'} onClick={() => { tapSfx(); setSub('hero'); }}>Sheet</SubButton>
        <SubButton active={sub === 'npcs'} onClick={() => { tapSfx(); setSub('npcs'); }}>
          NPCs{npcCount > 0 ? ` · ${npcCount}` : ''}
        </SubButton>
      </div>
    </div>
  );
};

const SubButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="flex-1 py-2 text-sm font-semibold relative"
    style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
  >
    {children}
    {active && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--accent)' }} />}
  </button>
);

const HeroList = ({ characters, activeId, onPlay, onRemove, onCreate }: { characters: any[]; activeId: string | null; onPlay: (id: string) => void; onRemove: (id: string) => void; onCreate: () => void }) => (
  <div className="p-4">
    <div className="text-center mt-6 mb-6">
      <div className="font-display text-3xl font-bold" style={{ color: 'var(--accent)' }}>Your Heroes</div>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Choose a character or forge a new one.</p>
    </div>

    {characters.length === 0 ? (
      <div className="card-gold text-center py-10">
        <div className="text-5xl mb-3">⚔️</div>
        <div className="font-display text-lg mb-1">No heroes yet</div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Build your first character to start adventuring.</p>
        <button className="btn btn-primary" onClick={onCreate}>+ Create character</button>
      </div>
    ) : (
      <>
        <div className="space-y-2 mb-4">
          {characters.map(c => (
            <div key={c.id} className="card flex items-center gap-3" style={{ borderColor: c.id === activeId ? 'var(--accent)' : 'var(--border)' }}>
              <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-base font-bold" style={{ background: 'var(--surface-2)', border: '1px solid var(--accent)' }}>
                {c.avatar ? <img src={c.avatar} className="w-full h-full object-cover" alt="" /> : (c.name[0]?.toUpperCase() || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Level {c.level} {c.race} {c.class}</div>
                <div className="text-xs" style={{ color: 'var(--accent)' }}>{c.hp.current}/{c.hp.max} HP · AC {c.ac}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button className="btn btn-primary text-xs" onClick={() => onPlay(c.id)}>{c.id === activeId ? 'Open' : 'Play'}</button>
                <button className="btn btn-ghost text-xs" onClick={() => onRemove(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost w-full" onClick={onCreate}>+ New character</button>
      </>
    )}
  </div>
);
