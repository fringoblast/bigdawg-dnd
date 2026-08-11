import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/state/useUIStore';
import { useSettingsStore } from '@/state/useSettingsStore';
import {
  listSnapshots, saveSnapshot, deleteSnapshot, restoreSnapshot,
  type SnapshotMeta
} from '@/lib/saveManager';
import { tapSfx } from '@/lib/audio';

interface Props { open: boolean; onClose: () => void; }

const fmtRelTime = (ts: number): string => {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function SavePointsSheet({ open, onClose }: Props) {
  const showToast = useUIStore(s => s.showToast);
  const appMode = useSettingsStore(s => s.appMode);
  const [saves, setSaves] = useState<SnapshotMeta[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await listSnapshots();
      setSaves(list);
    } catch (e) {
      showToast('Could not read saves (IndexedDB unavailable)', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) reload(); }, [open]);

  if (!open) return null;

  const onSave = async () => {
    if (appMode !== 'dnd') {
      showToast('Saves only capture D&D mode', 'warn');
      return;
    }
    setBusy(true);
    try {
      const trimmed = label.trim().slice(0, 80);
      const defaultLabel = `Save · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      await saveSnapshot({ label: trimmed || defaultLabel });
      setLabel('');
      tapSfx();
      showToast('Saved', 'success');
      await reload();
    } catch (e: any) {
      showToast('Save failed: ' + (e?.message || 'unknown'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async (meta: SnapshotMeta) => {
    if (!confirm(`Restore "${meta.label}"? Your current data will be overwritten.`)) return;
    setBusy(true);
    try {
      const snap = await restoreSnapshot(meta.id);
      if (!snap) { showToast('Save not found', 'error'); return; }
      tapSfx();
      showToast('Restored. Snapshot is live.', 'success', 4000);
      onClose();
    } catch (e: any) {
      showToast('Restore failed: ' + (e?.message || 'unknown'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (meta: SnapshotMeta) => {
    if (!confirm(`Delete save "${meta.label}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteSnapshot(meta.id);
      tapSfx();
      showToast('Save deleted', 'info');
      await reload();
    } catch (e: any) {
      showToast('Delete failed: ' + (e?.message || 'unknown'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
          className="w-full max-w-[480px] max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl m-0 sm:m-3"
          style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 p-3 flex items-center justify-between border-b z-10" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div>
              <div className="font-display text-lg" style={{ color: 'var(--accent)' }}>Save points</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>IndexedDB · {saves.length} slot{saves.length === 1 ? '' : 's'}</div>
            </div>
            <button onClick={onClose} className="text-2xl leading-none">×</button>
          </div>

          <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="label mb-1">New save</div>
            <div className="flex gap-1.5">
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSave()}
                placeholder={appMode === 'dnd' ? 'e.g. Before the goblin fight' : 'Saves only work in D&D mode'}
                disabled={appMode !== 'dnd' || busy}
                className="text-sm"
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary text-sm shrink-0" onClick={onSave} disabled={appMode !== 'dnd' || busy}>
                {busy ? '…' : '💾 Save'}
              </button>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Captures characters, sessions, chat, world, NPCs, dice history, settings. Tap “Restore” to come back to a slot later — useful before risky choices or big tests.
            </p>
          </div>

          <div className="overflow-y-auto p-3 space-y-2 flex-1">
            {loading && <div className="text-center text-sm py-6" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && saves.length === 0 && (
              <div className="card text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <div className="text-3xl mb-2">🗄️</div>
                <div className="text-sm">No saves yet.</div>
                <div className="text-xs mt-1">Snapshot your adventure before any big fight.</div>
              </div>
            )}
            {saves.map(meta => (
              <div key={meta.id} className="card flex gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate" style={{ color: 'var(--accent)' }}>{meta.label}</div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {fmtRelTime(meta.savedAt)}
                    {meta.characterName ? ` · ${meta.characterName}` : ''}
                    {meta.sessionName ? ` · “${meta.sessionName}”` : ''}
                    {meta.messageCount ? ` · ${meta.messageCount} msg` : ''}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button className="btn btn-primary text-xs px-2 py-1" onClick={() => onRestore(meta)} disabled={busy}>Restore</button>
                  <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => onDelete(meta)} disabled={busy}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 p-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
              Saves persist across devices in the same browser only — IndexedDB is local.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
