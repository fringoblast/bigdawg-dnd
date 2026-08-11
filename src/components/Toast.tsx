import { AnimatePresence, motion } from 'framer-motion';

export default function Toast({ text, tone }: { text: string; tone?: 'info' | 'success' | 'warn' | 'error' }) {
  const bg = tone === 'success' ? 'linear-gradient(180deg, #2c8a4a, #1e6b39)'
    : tone === 'warn' ? 'linear-gradient(180deg, #b8881f, #8B6F1F)'
    : tone === 'error' ? 'linear-gradient(180deg, #a82a1a, #7a1a10)'
    : 'linear-gradient(180deg, var(--accent), var(--accent-dim))';
  const color = tone === 'info' ? '#1a1a1a' : '#fff';
  return (
    <AnimatePresence>
      <motion.div
        key={text}
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="fixed left-0 right-0 mx-auto px-4"
        style={{ bottom: 96, maxWidth: 460, zIndex: 80, pointerEvents: 'none' }}
      >
        <div
          className="rounded-xl px-4 py-3 text-sm font-semibold shadow-lg text-center"
          style={{ background: bg, color }}
        >
          {text}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
