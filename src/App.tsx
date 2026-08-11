import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/state/useSettingsStore';
import { useUIStore, type Tab } from '@/state/useUIStore';
import { useCharacterStore } from '@/state/useCharacterStore';
import { useWorldStore } from '@/state/useWorldStore';
import { useSessionStore } from '@/state/useSessionStore';
import TabBar from '@/components/TabBar';
import Header from '@/components/Header';
import StoryTab from '@/components/story/StoryTab';
import CharacterTab from '@/components/character/CharacterTab';
import DiceTab from '@/components/dice/DiceTab';
import InventoryTab from '@/components/inventory/InventoryTab';
import WorldTab from '@/components/world/WorldTab';
import SettingsModal from '@/components/settings/SettingsModal';
import Onboarding from '@/components/Onboarding';
import Toast from '@/components/Toast';
import ChatShell from '@/components/chat/ChatShell';
import { setSoundEnabled } from '@/lib/audio';
import { waitForHydration } from '@/lib/hydration';

const TABS: Tab[] = ['story', 'character', 'dice', 'inventory', 'world'];

export default function App() {
  const { theme, soundOn, onboarded, appMode } = useSettingsStore();
  const { tab, settingsOpen, toast, setWorldNotif } = useUIStore();
  const { characters, activeId } = useCharacterStore();
  const { activeWorldId } = useWorldStore();
  const [ready, setReady] = useState(false);

  useEffect(() => { waitForHydration().then(() => setReady(true)); }, []);

  useEffect(() => {
    if (!ready) return;
    if (appMode === 'dnd' && activeId && !activeWorldId) setWorldNotif(true);
  }, [ready, appMode, activeId, activeWorldId, setWorldNotif]);

  useEffect(() => {
    if (!ready || appMode !== 'dnd' || !activeId) return;
    const { sessions, create, setActiveForMode, activeSessionIdByMode } = useSessionStore.getState();
    const dndId = activeSessionIdByMode.dnd;
    const hasActive = dndId && sessions.some(s => s.id === dndId && s.characterId === activeId && (s.mode || 'dnd') === 'dnd');
    if (hasActive) return;
    const charSessions = sessions.filter(s => s.characterId === activeId && (s.mode || 'dnd') === 'dnd');
    if (charSessions.length > 0) {
      setActiveForMode('dnd', charSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
      return;
    }
    const character = useCharacterStore.getState().characters.find(c => c.id === activeId);
    if (!character) return;
    const id = create({ name: `Adventure of ${character.name}`, characterId: character.id, mode: 'dnd' });
    setActiveForMode('dnd', id);
  }, [ready, appMode, activeId]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (mode: 'dark' | 'light') => {
      if (mode === 'light') root.classList.add('light');
      else root.classList.remove('light');
    };
    if (theme === 'system') {
      const m = window.matchMedia('(prefers-color-scheme: dark)');
      apply(m.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
      m.addEventListener('change', handler);
      return () => m.removeEventListener('change', handler);
    } else {
      apply(theme);
    }
  }, [theme]);

  useEffect(() => { setSoundEnabled(soundOn); }, [soundOn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useUIStore.getState().closeSettings();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return null;

  return (
    <div className="app-frame">
      <Header />
      {appMode === 'dnd' ? (
        <>
          <main className="scroll-area">
            {tab === 'story' && <StoryTab />}
            {tab === 'character' && <CharacterTab />}
            {tab === 'dice' && <DiceTab />}
            {tab === 'inventory' && <InventoryTab />}
            {tab === 'world' && <WorldTab />}
          </main>
          <TabBar tabs={TABS} />
          {characters.length === 0 && activeId === null && tab !== 'character' && tab !== 'world' && onboarded && (
            <div className="pointer-events-none fixed inset-x-0 top-16 flex justify-center">
              <div className="pointer-events-auto max-w-[420px] mx-3 card-gold mt-3 text-sm">
                <div className="font-display text-gold text-base mb-1">No character yet</div>
                <p className="text-[var(--text-muted)] mb-2">Create a hero to start your adventure.</p>
                <button className="btn btn-primary" onClick={() => useUIStore.getState().setTab('character')}>Create character</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <ChatShell />
      )}
      {settingsOpen && <SettingsModal />}
      {!onboarded && appMode === 'dnd' && <Onboarding />}
      {toast && <Toast key={toast.id} text={toast.text} tone={toast.tone} />}
    </div>
  );
}
