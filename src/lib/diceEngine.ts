import type { RollResult } from '@/types/message';

export const rollDie = (sides: number): number => 1 + Math.floor(Math.random() * sides);

export const rollExpression = (expr: string, label?: string): RollResult => {
  const cleaned = expr.replace(/\s+/g, '').toLowerCase();
  const re = /(\d*)d(\d+)(?:kh(\d+))?(?:kl(\d+))?([+-]\d+)?/g;
  const rolls: { die: number; sides: number; kept?: boolean }[] = [];
  let total = 0;
  let matched = false;
  for (const m of cleaned.matchAll(re)) {
    matched = true;
    const count = parseInt(m[1] || '1', 10);
    const sides = parseInt(m[2], 10);
    const kh = m[3] ? parseInt(m[3], 10) : undefined;
    const kl = m[4] ? parseInt(m[4], 10) : undefined;
    const mod = m[5] ? parseInt(m[5], 10) : 0;
    const local: { die: number; sides: number; kept?: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const d = rollDie(sides);
      local.push({ die: d, sides });
    }
    const sorted = [...local].map((x, i) => ({ ...x, i })).sort((a, b) => b.die - a.die);
    const keepIdx = new Set<number>();
    if (kh !== undefined) sorted.slice(0, kh).forEach(x => keepIdx.add(x.i));
    else if (kl !== undefined) sorted.slice(-kl).forEach(x => keepIdx.add(x.i));
    for (let i = 0; i < local.length; i++) {
      if (kh === undefined && kl === undefined) {
        local[i].kept = true;
        total += local[i].die;
      } else if (keepIdx.has(i)) {
        local[i].kept = true;
        total += local[i].die;
      }
    }
    total += mod;
    rolls.push(...local);
  }
  if (!matched) {
    const flat = parseInt(cleaned, 10);
    if (!isNaN(flat)) total = flat;
  }
  return {
    id: crypto.randomUUID(),
    expression: cleaned,
    rolls,
    modifier: 0,
    total,
    label,
    ts: Date.now()
  };
};

export const formatRoll = (r: RollResult): string => {
  const detail = r.rolls
    .map(x => x.kept === false ? `~~${x.die}~~` : `${x.die}`)
    .join(', ');
  return `🎲 ${r.label || r.expression} = [${detail}]${r.modifier ? ` ${r.modifier >= 0 ? '+' : ''}${r.modifier}` : ''} = **${r.total}**`;
};
