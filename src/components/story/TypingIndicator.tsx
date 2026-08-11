import { motion } from 'framer-motion';

export default function TypingIndicator({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-end gap-2 justify-end"
    >
      <div
        className="max-w-[78%] rounded-2xl px-3 py-2 text-sm"
        style={{
          background: 'linear-gradient(180deg, var(--surface), var(--surface-2))',
          border: '1px solid rgba(212,175,55,0.35)'
        }}
      >
        <div className="flex items-center gap-2">
          <motion.svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            animate={{ rotate: [-8, 8, -8], y: [0, -2, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ color: 'var(--accent)' }}
          >
            <path d="M20 4 9 15l-5 1 1-5L16 0" transform="translate(2 4)" />
            <path d="M3 21h18" />
          </motion.svg>
          <span style={{ color: 'var(--accent)' }} className="font-medium">
            {text || 'The DM is writing your story…'}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          <motion.span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity }} />
          <motion.span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.15 }} />
          <motion.span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} animate={{ y: [0, -3, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.3 }} />
        </div>
      </div>
      <div
        className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1a1a1a">
          <path d="M12 2L9 9H2l5.5 4.5L5 22l7-5 7 5-2.5-8.5L22 9h-7z" />
        </svg>
      </div>
    </motion.div>
  );
}
