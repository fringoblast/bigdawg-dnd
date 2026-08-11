import type { Tab } from '@/state/useUIStore';
import { useUIStore } from '@/state/useUIStore';
import { haptics } from '@/lib/audio';
import { motion } from 'framer-motion';

const ICONS: Record<Tab, JSX.Element> = {
  story: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  character: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  dice: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <rect x="3" y="3" width="18" height="18" rx="3" transform="rotate(45 12 12)" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
      <circle cx="7" cy="17" r="1" fill="currentColor" />
      <circle cx="17" cy="17" r="1" fill="currentColor" />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  world: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
};

const labels: Record<Tab, string> = {
  story: 'Story',
  character: 'Hero',
  dice: 'Dice',
  inventory: 'Loot',
  world: 'World'
};

export default function TabBar({ tabs }: { tabs: Tab[] }) {
  const tab = useUIStore(s => s.tab);
  const setTab = useUIStore(s => s.setTab);
  const worldNotif = useUIStore(s => s.worldNotif);
  const setWorldNotif = useUIStore(s => s.setWorldNotif);

  return (
    <nav
      className="safe-bottom"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        flexShrink: 0
      }}
    >
      {tabs.map(t => {
        const active = tab === t;
        const notif = t === 'world' && worldNotif && !active;
        return (
          <button
            key={t}
            onClick={() => { haptics(8); if (t === 'world') setWorldNotif(false); setTab(t); }}
            className="flex flex-col items-center justify-center gap-0.5 py-2 relative"
            style={{ color: active ? 'var(--accent)' : 'var(--text-muted)', minHeight: 56 }}
          >
            <div className="relative">
              {ICONS[t]}
              {active && <div className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
              {notif && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="absolute -top-2 -right-2 w-3 h-3 rounded-full"
                  style={{ background: 'var(--danger)', boxShadow: '0 0 8px rgba(192, 57, 43, 0.6)' }}
                />
              )}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider">{labels[t]}</span>
          </button>
        );
      })}
    </nav>
  );
}
