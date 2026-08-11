import { useUIStore } from '@/state/useUIStore';
import { useSettingsStore } from '@/state/useSettingsStore';
import { haptics } from '@/lib/audio';

const titles: Record<string, string> = {
  story: 'Story',
  character: 'Character',
  dice: 'Dice',
  inventory: 'Inventory',
  world: 'World',
  chat: 'Chat'
};

export default function Header() {
  const tab = useUIStore(s => s.tab);
  const openSettings = useUIStore(s => s.openSettings);
  const appMode = useSettingsStore(s => s.appMode);
  const setAppMode = useSettingsStore(s => s.setAppMode);

  return (
    <header
      className="safe-top flex items-center justify-between px-3 py-3 border-b gap-2"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-display text-sm font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))', color: '#1a1a1a' }}
        >
          d20
        </div>
        <h1 className="font-display text-base font-semibold tracking-wide truncate" style={{ color: 'var(--accent)' }}>
          BigDawg D&D
        </h1>
      </div>
      <div className="hidden sm:block text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
        {appMode === 'chat' ? titles.chat : titles[tab]}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-full overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button
            onClick={() => { haptics(6); setAppMode('dnd'); }}
            className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: appMode === 'dnd' ? 'var(--accent)' : 'transparent', color: appMode === 'dnd' ? '#1a1a1a' : 'var(--text-muted)' }}
          >D&amp;D</button>
          <button
            onClick={() => { haptics(6); setAppMode('chat'); }}
            className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: appMode === 'chat' ? 'var(--accent)' : 'transparent', color: appMode === 'chat' ? '#1a1a1a' : 'var(--text-muted)' }}
          >Chat</button>
        </div>
        <button
          aria-label="Settings"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          onClick={openSettings}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
