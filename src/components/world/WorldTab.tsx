import { useEffect, useState } from 'react';
import { useWorldStore } from '@/state/useWorldStore';
import { TOTAL_TONE_NOTES } from '@/lib/tones';
import { uid } from '@/lib/storage';
import type { WorldTone, WorldFaction, WorldNPC, WorldLocation } from '@/types/world';
import { useUIStore } from '@/state/useUIStore';
import { tapSfx, pageSfx } from '@/lib/audio';

type Section = 'list' | 'edit-world' | 'edit-story';

export default function WorldTab() {
  const { worlds, stories, activeWorldId, activeStoryId } = useWorldStore();
  const { createWorld, updateWorld, removeWorld, createStory, updateStory, removeStory, setActiveWorld, setActiveStory } = useWorldStore();
  const [section, setSection] = useState<Section>('list');
  const [editingWorldId, setEditingWorldId] = useState<string | null>(null);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const showToast = useUIStore(s => s.showToast);
  const setWorldNotif = useUIStore(s => s.setWorldNotif);

  useEffect(() => { setWorldNotif(false); }, [setWorldNotif]);

  return (
    <div className="p-3">
      <div className="flex gap-1 mb-3">
        {(['list','edit-world','edit-story'] as Section[]).map(s => (
          <button
            key={s}
            onClick={() => { tapSfx(); setSection(s); }}
            className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize"
            style={{ background: section === s ? 'var(--accent)' : 'var(--surface-2)', color: section === s ? '#1a1a1a' : 'var(--text)' }}
          >{s.replace('-', ' ')}</button>
        ))}
      </div>

      {section === 'list' && (
        <>
          <div className="card-gold mb-3">
            <div className="label mb-1">Active World</div>
            {worlds.find(w => w.id === activeWorldId) ? (
              <div>
                <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>{worlds.find(w => w.id === activeWorldId)?.name}</div>
                <div className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{worlds.find(w => w.id === activeWorldId)?.tone}</div>
                <p className="text-xs mt-1">{worlds.find(w => w.id === activeWorldId)?.summary}</p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>None. Create one to set the stage.</p>
            )}
          </div>

          <div className="card-gold mb-3">
            <div className="label mb-1">Active Story</div>
            {stories.find(s => s.id === activeStoryId) ? (
              <div>
                <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>{stories.find(s => s.id === activeStoryId)?.name}</div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{stories.find(s => s.id === activeStoryId)?.hook}</p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>None. Optional — start fresh without one.</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="label">All worlds</div>
            {worlds.length === 0 && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No worlds yet.</div>}
            {worlds.map(w => (
              <div key={w.id} className="card flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{w.name}</div>
                  <div className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{w.tone}</div>
                </div>
                <button onClick={() => { setActiveWorld(w.id === activeWorldId ? null : w.id); showToast(w.id === activeWorldId ? 'World cleared' : 'World set', 'info'); }} className="text-xs px-2 py-1 rounded" style={{ background: w.id === activeWorldId ? 'var(--accent)' : 'var(--surface-2)', color: w.id === activeWorldId ? '#1a1a1a' : 'var(--text)' }}>{w.id === activeWorldId ? 'Active' : 'Set'}</button>
                <button onClick={() => { setEditingWorldId(w.id); setSection('edit-world'); }} className="text-xs">✎</button>
                <button onClick={() => { if (confirm(`Delete world "${w.name}"?`)) removeWorld(w.id); }} className="text-xs" style={{ color: 'var(--danger)' }}>×</button>
              </div>
            ))}

            <div className="label mt-4">All stories</div>
            {stories.length === 0 && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No stories yet.</div>}
            {stories.map(s => (
              <div key={s.id} className="card flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{s.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.hook?.slice(0, 60)}…</div>
                </div>
                <button onClick={() => { setActiveStory(s.id === activeStoryId ? null : s.id); }} className="text-xs px-2 py-1 rounded" style={{ background: s.id === activeStoryId ? 'var(--accent)' : 'var(--surface-2)', color: s.id === activeStoryId ? '#1a1a1a' : 'var(--text)' }}>{s.id === activeStoryId ? 'Active' : 'Set'}</button>
                <button onClick={() => { setEditingStoryId(s.id); setSection('edit-story'); }} className="text-xs">✎</button>
                <button onClick={() => { if (confirm(`Delete story "${s.name}"?`)) removeStory(s.id); }} className="text-xs" style={{ color: 'var(--danger)' }}>×</button>
              </div>
            ))}
          </div>
        </>
      )}

      {section === 'edit-world' && <WorldEditor editingId={editingWorldId} onDone={(id) => { setEditingWorldId(id); setSection('list'); pageSfx(); showToast(id ? 'World saved' : 'World created', 'success'); }} />}
      {section === 'edit-story' && <StoryEditor editingId={editingStoryId} onDone={(id) => { setEditingStoryId(id); setSection('list'); pageSfx(); showToast(id ? 'Story saved' : 'Story created', 'success'); }} />}
    </div>
  );
}

const WorldEditor = ({ editingId, onDone }: { editingId: string | null; onDone: (id: string | null) => void }) => {
  const existing = useWorldStore(s => s.worlds.find(w => w.id === editingId));
  const createWorld = useWorldStore(s => s.createWorld);
  const updateWorld = useWorldStore(s => s.updateWorld);
  const setActiveWorld = useWorldStore(s => s.setActiveWorld);

  const [name, setName] = useState(existing?.name || '');
  const [tone, setTone] = useState<WorldTone>(existing?.tone || 'high fantasy');
  const [summary, setSummary] = useState(existing?.summary || '');
  const [lore, setLore] = useState(existing?.lore || '');
  const [factions, setFactions] = useState<WorldFaction[]>(existing?.factions || []);
  const [npcs, setNpcs] = useState<WorldNPC[]>(existing?.npcs || []);
  const [locations, setLocations] = useState<WorldLocation[]>(existing?.locations || []);
  const [hooks, setHooks] = useState<string[]>(existing?.hooks || []);
  const [rules, setRules] = useState(existing?.rules || '');

  const save = () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), tone, summary, lore, factions, npcs, locations, hooks, rules };
    if (editingId) { updateWorld(editingId, payload); onDone(editingId); }
    else { const id = createWorld(payload); setActiveWorld(id); onDone(id); }
  };

  return (
    <div className="space-y-3">
      <div className="card-gold">
        <div className="label mb-1">Name</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="The Shattered Vale" />
        <div className="label mt-2 mb-1">Tone</div>
        <select value={tone} onChange={e => setTone(e.target.value as WorldTone)}>
          {Object.keys(TOTAL_TONE_NOTES).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <p className="text-[11px] mt-1 italic" style={{ color: 'var(--text-muted)' }}>{TOTAL_TONE_NOTES[tone]}</p>
        <div className="label mt-2 mb-1">One-line summary</div>
        <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="A kingdom of seven warring duchies…" />
        <div className="label mt-2 mb-1">Lore &amp; history</div>
        <textarea rows={3} value={lore} onChange={e => setLore(e.target.value)} />
        <div className="label mt-2 mb-1">House rules (optional)</div>
        <textarea rows={2} value={rules} onChange={e => setRules(e.target.value)} placeholder="Critical hits double damage dice, not weapon dice…" />
      </div>

      <EditableList title="Factions" items={factions} onChange={setFactions} newItem={{ name: '', description: '', alignment: '' }} fields={[
        { key: 'name', label: 'Name' }, { key: 'description', label: 'Description', textarea: true }, { key: 'alignment', label: 'Alignment' }
      ]} />

      <EditableList title="Key NPCs" items={npcs} onChange={setNpcs} newItem={{ name: '', role: '', description: '', disposition: 'neutral' as const }} fields={[
        { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'description', label: 'Description', textarea: true }
      ]} />

      <EditableList title="Locations" items={locations} onChange={setLocations} newItem={{ name: '', description: '' }} fields={[
        { key: 'name', label: 'Name' }, { key: 'description', label: 'Description', textarea: true }
      ]} />

      <StringList label="Plot hooks" items={hooks} onChange={setHooks} placeholder="A noble's daughter has vanished…" />

      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={() => onDone(null)}>Cancel</button>
        <button className="btn btn-primary flex-1" onClick={save}>{editingId ? 'Save' : 'Create'}</button>
      </div>
    </div>
  );
};

const StoryEditor = ({ editingId, onDone }: { editingId: string | null; onDone: (id: string | null) => void }) => {
  const existing = useWorldStore(s => s.stories.find(x => x.id === editingId));
  const createStory = useWorldStore(s => s.createStory);
  const updateStory = useWorldStore(s => s.updateStory);
  const setActiveStory = useWorldStore(s => s.setActiveStory);

  const [name, setName] = useState(existing?.name || '');
  const [hook, setHook] = useState(existing?.hook || '');
  const [inciting, setInciting] = useState(existing?.incitingIncident || '');
  const [opening, setOpening] = useState(existing?.openingScene || '');
  const [chapter, setChapter] = useState(existing?.currentChapter || '');
  const [notes, setNotes] = useState(existing?.notes || '');

  const save = () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), hook, incitingIncident: inciting, openingScene: opening, currentChapter: chapter, notes };
    if (editingId) { updateStory(editingId, payload); onDone(editingId); }
    else { const id = createStory(payload); setActiveStory(id); onDone(id); }
  };

  return (
    <div className="space-y-3">
      <div className="card-gold">
        <div className="label mb-1">Story name</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="The Lost Crown of Eldar" />
        <div className="label mt-2 mb-1">Hook</div>
        <textarea rows={2} value={hook} onChange={e => setHook(e.target.value)} placeholder="An ancient crown resurfaces after a millennium…" />
        <div className="label mt-2 mb-1">Inciting incident</div>
        <textarea rows={2} value={inciting} onChange={e => setInciting(e.target.value)} placeholder="The party is hired to recover the crown from a sunken temple…" />
        <div className="label mt-2 mb-1">Opening scene</div>
        <textarea rows={3} value={opening} onChange={e => setOpening(e.target.value)} placeholder="The party gathers in the dim light of the Crooked Lantern tavern…" />
        <div className="label mt-2 mb-1">Current chapter</div>
        <input value={chapter} onChange={e => setChapter(e.target.value)} placeholder="Act 1: The Temple" />
        <div className="label mt-2 mb-1">DM notes</div>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reveal the BBEG as the party reaches the crown…" />
      </div>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={() => onDone(null)}>Cancel</button>
        <button className="btn btn-primary flex-1" onClick={save}>{editingId ? 'Save' : 'Create'}</button>
      </div>
    </div>
  );
};

interface FieldDef { key: string; label: string; textarea?: boolean; }

const EditableList = <T extends { id: string }>({ title, items, onChange, newItem, fields }: {
  title: string; items: T[]; onChange: (v: T[]) => void; newItem: Omit<T, 'id'>; fields: FieldDef[];
}) => {
  const add = () => onChange([...items, { ...(newItem as any), id: uid() }]);
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const update = (id: string, patch: any) => onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="label">{title}</div>
        <button onClick={add} className="btn btn-ghost text-xs">+ Add</button>
      </div>
      {items.length === 0 && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>None yet.</div>}
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.id} className="rounded-lg p-2 space-y-1" style={{ background: 'var(--surface-2)' }}>
            {fields.map(f => f.textarea ? (
              <textarea key={f.key} rows={2} value={(it as any)[f.key] || ''} onChange={e => update(it.id, { [f.key]: e.target.value })} placeholder={f.label} />
            ) : (
              <input key={f.key} value={(it as any)[f.key] || ''} onChange={e => update(it.id, { [f.key]: e.target.value })} placeholder={f.label} />
            ))}
            <button onClick={() => remove(it.id)} className="text-xs" style={{ color: 'var(--danger)' }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
};

const StringList = ({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) => {
  const [v, setV] = useState('');
  return (
    <div className="card">
      <div className="label mb-2">{label}</div>
      {items.length === 0 && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>None yet.</div>}
      <div className="space-y-1 mb-2">
        {items.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm rounded p-2" style={{ background: 'var(--surface-2)' }}>
            <span className="flex-1">{s}</span>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-xs" style={{ color: 'var(--danger)' }}>×</button>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} />
        <button className="btn btn-primary text-xs" onClick={() => { if (v.trim()) { onChange([...items, v.trim()]); setV(''); } }}>Add</button>
      </div>
    </div>
  );
};
