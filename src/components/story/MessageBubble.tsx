import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Message } from '@/types/message';
import type { Character } from '@/types/character';
import { formatRoll } from '@/lib/diceEngine';
import { extractStatusBlock, findRollRequests } from '@/lib/stateParser';

interface Props {
  message: Message;
  character: Character | null;
  onChoiceSelect?: (choice: string) => void;
  onRollRequest?: (expression: string, label: string) => void;
}

// Matches bracketed dice like `[1d20+3=15]` or `[2d6=8]` that the chat store rolls
// from AI prose. Matches the bracketed expression and an optional `=<total>`.
const AI_DICE_RESULTS_RE = /\[(\d*d\d+(?:[+-]\d+)?(?:kh\d+)?(?:kl\d+)?)(?:=(\d+))?\]/gi;

export default function MessageBubble({ message, character, onChoiceSelect, onRollRequest }: Props) {
  const isPlayer = message.role === 'player';
  const isSystem = message.role === 'system';
  const isDm = message.role === 'dm';
  const [imgOpen, setImgOpen] = useState(false);
  const [usedChoices, setUsedChoices] = useState<Set<string>>(new Set());
  const [usedRolls, setUsedRolls] = useState<Set<string>>(new Set());

  if (isSystem) {
    return (
      <div className="text-center my-2">
        <div className="inline-block px-3 py-1.5 rounded-full text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          {message.text}
        </div>
      </div>
    );
  }

  const choices = isDm ? extractChoices(message.text) : [];
  const preText = isDm ? stripChoices(message.text) : message.text;
  const { cleaned: bodyText, status } = isDm ? extractStatusBlock(preText) : { cleaned: preText, status: null };
  const rollRequests = isDm ? findRollRequests(bodyText) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-end gap-2 ${isPlayer ? 'justify-start' : 'justify-end'}`}
    >
      {isPlayer && (
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {character?.avatar
            ? <img src={character.avatar} className="w-full h-full object-cover" alt="" />
            : <span style={{ color: 'var(--accent)' }}>{(character?.name || 'P').slice(0, 2).toUpperCase()}</span>}
        </div>
      )}

      <div
        className="max-w-[78%] rounded-2xl px-3 py-2 text-[15px] leading-relaxed"
        style={{
          background: isPlayer ? 'var(--surface-2)' : 'linear-gradient(180deg, var(--surface), var(--surface-2))',
          color: 'var(--text)',
          border: isPlayer ? '1px solid var(--border)' : '1px solid rgba(212,175,55,0.35)',
          boxShadow: isPlayer ? 'none' : '0 0 0 1px rgba(212,175,55,0.05)'
        }}
      >
        {message.image && (
          <button onClick={() => setImgOpen(true)} className="block mb-2 -mx-1 -mt-1">
            <img src={message.image} className="rounded-lg max-h-48 object-cover" alt="" />
          </button>
        )}
        {message.roll && (
          <div className="font-mono text-[12px] mb-1.5 px-2 py-1 rounded inline-block" style={{ background: 'rgba(212,175,55,0.08)', color: 'var(--accent)' }}>
            {formatRoll(message.roll)}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{renderTextWithDice(bodyText)}</div>
        {rollRequests.length > 0 && onRollRequest && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rollRequests.map((r, idx) => {
              const key = r.raw;
              const used = usedRolls.has(key);
              return (
                <button
                  key={`${idx}-${key}`}
                  disabled={used}
                  onClick={() => { if (used) return; setUsedRolls(prev => new Set(prev).add(key)); onRollRequest(r.expression, r.label); }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold active:scale-[0.97] transition"
                  style={{
                    background: used ? 'var(--surface-3)' : 'rgba(212,175,55,0.16)',
                    border: '1px solid rgba(212,175,55,0.5)',
                    color: used ? 'var(--text-muted)' : 'var(--accent)'
                  }}
                >
                  🎲 {r.expression}{r.label ? ` — ${r.label}` : ''}{used ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        )}
        {status && (
          <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.07)' }}>
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold" style={{ background: 'rgba(212,175,55,0.18)', color: 'var(--accent)' }}>🎯 Status</div>
            <div className="px-2.5 py-1.5 space-y-0.5 text-[12px]">
              {Object.entries(status).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span className="font-semibold text-right" style={{ color: 'var(--text)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {choices.length > 0 && onChoiceSelect && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>What do you do?</div>
            {choices.map((c, idx) => {
              const used = usedChoices.has(c);
              return (
                <button
                  key={`${idx}-${c}`}
                  onClick={() => {
                    if (used) return;
                    setUsedChoices(prev => new Set(prev).add(c));
                    onChoiceSelect(c);
                  }}
                  className="text-left text-sm py-2 px-2.5 rounded-lg active:scale-[0.99] transition"
                  style={{
                    background: used ? 'var(--surface-3)' : 'rgba(212,175,55,0.08)',
                    border: '1px solid ' + (used ? 'var(--border)' : 'rgba(212,175,55,0.4)'),
                    color: used ? 'var(--text-muted)' : 'var(--accent)',
                    cursor: used ? 'default' : 'pointer'
                  }}
                >
                  <span className="font-semibold mr-1" style={{ color: used ? 'var(--text-muted)' : 'var(--accent)' }}>›</span>
                  {c}
                </button>
              );
            })}
          </div>
        )}
        {message.stateDelta && (
          <div className="mt-2 text-[11px] pt-1.5 border-t" style={{ borderColor: 'rgba(212,175,55,0.2)', color: 'var(--accent)' }}>
            📜 {summarizeDelta(message.stateDelta)}
          </div>
        )}
        {message.pending && (
          <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-block animate-pulse">●</span> streaming
          </div>
        )}
        {message.error && (
          <div className="mt-1 text-[11px]" style={{ color: 'var(--danger)' }}>Connection issue</div>
        )}
      </div>

      {!isPlayer && (
        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))', boxShadow: '0 0 0 2px rgba(212,175,55,0.4)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#1a1a1a">
            <path d="M12 2L9 9H2l5.5 4.5L5 22l7-5 7 5-2.5-8.5L22 9h-7z" />
          </svg>
        </div>
      )}

      {imgOpen && message.image && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setImgOpen(false)}>
          <img src={message.image} className="max-w-full max-h-full rounded-lg" alt="" />
        </div>
      )}
    </motion.div>
  );
}

const extractChoices = (text: string): string[] => {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = /(?:^|\n)\s*>\s+([^\n]+)/g;
  while ((m = re.exec(text)) !== null) {
    const c = m[1].trim();
    if (c) out.push(c);
  }
  return out;
};

const stripChoices = (text: string): string => {
  return text.replace(/(?:^|\n)\s*>[^\n]*/g, '').replace(/\n{3,}/g, '\n\n').trim();
};

const DicePill = ({ expression, total }: { expression: string; total: string | number | undefined }) => {
  const label = total !== undefined ? `${expression}=${total}` : expression;
  return (
    <span
      className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded-full font-mono text-[12px] align-baseline"
      style={{ background: 'rgba(212,175,55,0.14)', color: 'var(--accent)', border: '1px solid rgba(212,175,55,0.35)' }}
      title="AI rolled this"
    >
      🎲 {label}
    </span>
  );
};

const renderTextWithDice = (input: string): (string | JSX.Element)[] => {
  // Walk the text, splitting on AI dice pill matches. We render other markdown
  // inside the non-pill segments.
  const parts: (string | JSX.Element)[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  let keyCounter = 0;
  AI_DICE_RESULTS_RE.lastIndex = 0;
  while ((m = AI_DICE_RESULTS_RE.exec(input)) !== null) {
    if (m.index > cursor) {
      const between = input.slice(cursor, m.index);
      const inner = renderText(between);
      for (const x of inner) parts.push(x);
    }
    parts.push(<DicePill key={`d-${keyCounter++}-${m.index}`} expression={m[1]} total={m[2]} />);
    cursor = m.index + m[0].length;
  }
  if (cursor < input.length) {
    const tail = renderText(input.slice(cursor));
    for (const x of tail) parts.push(x);
  }
  return parts;
};

const renderText = (text: string): (string | JSX.Element)[] => {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={i++} style={{ color: 'var(--accent)' }}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*')) parts.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith('_')) parts.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith('`')) parts.push(<code key={i++} className="font-mono text-[12px] px-1 rounded" style={{ background: 'var(--surface-3)' }}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

const summarizeDelta = (d: import('@/types/message').StateDelta): string => {
  const parts: string[] = [];
  if (typeof d.hpDelta === 'number' && d.hpDelta !== 0) parts.push(d.hpDelta >= 0 ? `+${d.hpDelta} HP` : `${d.hpDelta} HP`);
  if (typeof d.tempHpDelta === 'number' && d.tempHpDelta > 0) parts.push(`+${d.tempHpDelta} temp`);
  if (typeof d.hpMaxDelta === 'number' && d.hpMaxDelta !== 0) parts.push(`${d.hpMaxDelta >= 0 ? '+' : ''}${d.hpMaxDelta} max HP`);
  if (typeof d.exp === 'number' && d.exp > 0) parts.push(`+${d.exp} XP`);
  if (d.levelUp) parts.push('LEVEL UP ✨');
  if (d.currencyDelta) for (const k of ['cp','sp','ep','gp','pp'] as const) {
    const v = d.currencyDelta[k];
    if (typeof v === 'number' && v !== 0) parts.push(`${v >= 0 ? '+' : ''}${v} ${k.toUpperCase()}`);
  }
  if (d.itemsAdd?.length) parts.push(`+${d.itemsAdd.map(i => i.name).join(', ')}`);
  if (d.itemsRemove?.length) parts.push(`-${d.itemsRemove.map(i => i.name).join(', ')}`);
  if (d.conditionsAdd?.length) parts.push(`+${d.conditionsAdd.map(c => c.name).join(', ')}`);
  if (d.conditionsRemove?.length) parts.push(`cleared ${d.conditionsRemove.join(', ')}`);
  if (d.spellSlotsUse?.length) parts.push(`-slot L${d.spellSlotsUse.map(s => s.level).join(',L')}`);
  return parts.join(' · ');
};
