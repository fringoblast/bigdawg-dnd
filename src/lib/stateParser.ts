import type { StateDelta } from '@/types/message';

const STATE_RE = /\[STATE\]([\s\S]*?)\[\/STATE\]/g;

// Stray JSON that the model sometimes leaks into prose when it tries to "call" the function itself.
// Greedy-safe: ends on the matching close brace of a {...} block containing name+arguments, non-greedy across the whole blob.
const STRAY_TOOL_CALL_RE = /\{\s*["']?name["']?\s*:\s*["']?update_character_state["']?[\s\S]*?\}/g;
// Matches plain <tool_call>...</tool_call> tags that some models emit.
const TOOL_CALL_TAG_RE = /<tool_call[\s\S]*?<\/tool_call>/g;
// Matches code-fenced JSON or "function_calls" / "tool_calls" blocks.
const CODE_FENCE_RE = /```[a-zA-Z]*\n[\s\S]*?```/g;
// Matches lines that look like YAML/JSON tool-call fragments (e.g. "tool_calls: ...", "arguments: {...}").
const TOOL_CALL_LINE_RE = /^\s*(tool_calls?|function_calls?|arguments|parameters)\s*[:=]/gim;

// The DM's end-of-message status block: --- ðŸŽ¯ Status --- ... --- end status ---
// Also tolerate incomplete variants (missing '--- end status ---' or slightly different punctuation).
const STATUS_RE = /\n?---\s*ðŸŽ¯?\s*Status\s*---[\s\S]*?(?:---\s*end status\s*---|\n---\s*$|$)/i;

// The DM's roll request: "ðŸŽ² Roll a d20+5 for Stealth." / "ðŸŽ² roll d20+3 to hit"
const ROLL_REQ_RE = /ðŸŽ²\s*Roll(?:ing)?\s+(?:a|an|the)?\s*((?:\d*d\d+(?:\s*[+-]\s*\d+)?(?:\s*[+-]\s*\d*)?)+)\s*(?:for|to|of)?\s*([^.\n]{0,80})?/gi;

const ALLOWED_DAMAGE = new Set([
  'slashing','piercing','bludgeoning','fire','cold','lightning','thunder','acid','poison','radiant','necrotic','psychic','force'
]);

const ALLOWED_CATEGORIES = new Set(['weapon','armor','gear','tool','consumable','treasure','misc']);

const num = (v: any): number | null => {
  if (typeof v === 'number' && isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number(v);
    if (isFinite(n)) return Math.trunc(n);
  }
  return null;
};

export const stripLeakage = (s: string): string => {
  return s
    .replace(TOOL_CALL_TAG_RE, '')
    .replace(STRAY_TOOL_CALL_RE, '')
    .replace(CODE_FENCE_RE, '')
    .replace(TOOL_CALL_LINE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const mergeDeltas = (a: StateDelta, b: StateDelta): StateDelta => {
  const addDelta = <K extends 'hpDelta' | 'tempHpDelta' | 'hpMaxDelta'>(key: K) => {
    const va = a[key], vb = b[key];
    if (typeof va === 'number' || typeof vb === 'number') (a as any)[key] = (typeof va === 'number' ? va : 0) + (typeof vb === 'number' ? vb : 0);
  };
  addDelta('hpDelta'); addDelta('tempHpDelta'); addDelta('hpMaxDelta');
  if (typeof b.acDelta === 'number') a.acDelta = b.acDelta;
  if (b.currencyDelta) {
    if (!a.currencyDelta) a.currencyDelta = {};
    for (const k of ['cp','sp','ep','gp','pp'] as const) {
      const vb = b.currencyDelta[k];
      if (typeof vb === 'number') (a.currencyDelta as any)[k] = ((a.currencyDelta as any)[k] || 0) + vb;
    }
  }
  if (b.itemsAdd?.length) a.itemsAdd = [...(a.itemsAdd || []), ...b.itemsAdd];
  if (b.itemsRemove?.length) a.itemsRemove = [...(a.itemsRemove || []), ...b.itemsRemove];
  if (b.conditionsAdd?.length) a.conditionsAdd = [...(a.conditionsAdd || []), ...b.conditionsAdd];
  if (b.conditionsRemove?.length) a.conditionsRemove = [...(a.conditionsRemove || []), ...b.conditionsRemove];
  if (b.spellSlotsUse?.length) a.spellSlotsUse = [...(a.spellSlotsUse || []), ...b.spellSlotsUse];
  if (b.npcsIntroduced?.length) a.npcsIntroduced = [...(a.npcsIntroduced || []), ...b.npcsIntroduced];
  if (typeof b.exp === 'number') a.exp = (typeof a.exp === 'number' ? a.exp : 0) + b.exp;
  if (b.levelUp) a.levelUp = true;
  if (b.notes) a.notes = a.notes ? a.notes + '\n' + b.notes : b.notes;
  return a;
};

export const isEmptyDelta = (d: StateDelta | null | undefined): boolean => {
  if (!d) return true;
  return typeof d.hpDelta !== 'number'
    && typeof d.tempHpDelta !== 'number'
    && typeof d.hpMaxDelta !== 'number'
    && typeof d.acDelta !== 'number'
    && !d.currencyDelta
    && !d.itemsAdd?.length
    && !d.itemsRemove?.length
    && !d.conditionsAdd?.length
    && !d.conditionsRemove?.length
    && !d.spellSlotsUse?.length
    && !d.npcsIntroduced?.length
    && typeof d.exp !== 'number'
    && !d.levelUp;
};

const unwrapState = (raw: any): any => {
  // Common wrapper patterns: {state: {...}}, {update_character_state: {...}}, {data: {...}}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of ['state', 'update_character_state', 'data', 'character', 'delta']) {
      if (raw[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k])) return raw[k];
    }
  }
  return raw;
};

export const extractStateDelta = (text: string): { cleaned: string; delta: StateDelta | null } => {
  let delta: StateDelta = {};
  let found = false;
  // First: explicit [STATE]...[/STATE] blocks (merged when multiple).
  let cleaned = text.replace(STATE_RE, (_, body) => {
    try {
      const d = sanitize(unwrapState(JSON.parse(body)));
      if (!isEmptyDelta(d)) { mergeDeltas(delta, d); found = true; }
    } catch {
      // ignore parse errors
    }
    return '';
  });
  // Then: salvage any leaked inline tool-call JSON (best-effort â€” the model meant to call it, not print it).
  cleaned = cleaned.replace(STRAY_TOOL_CALL_RE, (blob) => {
    try {
      const parsed = JSON.parse(blob);
      const args = parsed?.arguments ?? parsed?.function?.arguments ?? parsed;
      const d = sanitize(unwrapState(typeof args === 'string' ? JSON.parse(args) : args));
      if (!isEmptyDelta(d)) { mergeDeltas(delta, d); found = true; }
    } catch {
      // ignore
    }
    return '';
  });
  // Finally: strip remaining code fences / tool-fragment lines.
  cleaned = stripLeakage(cleaned);
  return { cleaned, delta: found ? delta : null };
};

/** Pull the status block out of prose so MessageBubble can render it as a card. */
export const extractStatusBlock = (text: string): { cleaned: string; status: Record<string, string> | null } => {
  const m = text.match(STATUS_RE);
  if (!m) return { cleaned: text, status: null };
  const body = m[0];
  const cleaned = text.replace(STATUS_RE, '').trim();
  const status: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const kv = line.match(/^\s*[-â€¢*]?\s*\**([^:*\n]{1,24})\**\s*[:=]\s*(.+)$/);
    if (kv && !/ðŸŽ¯\s*Status/i.test(kv[0]) && !/^---/.test(kv[0])) {
      status[kv[1].trim().replace(/\*+/g, '').trim()] = kv[2].trim();
    }
  }
  return { cleaned, status: Object.keys(status).length ? status : null };
};

/** Find "ðŸŽ² Roll a d20+5 for Stealth"-style requests inside DM prose. */
export const findRollRequests = (text: string): { expression: string; label: string; raw: string }[] => {
  const out: { expression: string; label: string; raw: string }[] = [];
  for (const m of text.matchAll(ROLL_REQ_RE)) {
    out.push({
      raw: m[0],
      expression: (m[1] || '').replace(/\s+/g, '').toLowerCase(),
      label: (m[2] || '').trim()
    });
  }
  return out;
};

const sanitize = (raw: any): StateDelta => {
  const d: StateDelta = {};
  const hp = num(raw.hp); if (hp !== null) d.hpDelta = hp;
  const tempHp = num(raw.tempHp); if (tempHp !== null) d.tempHpDelta = tempHp;
  const hpMax = num(raw.hpMax); if (hpMax !== null) d.hpMaxDelta = hpMax;
  const ac = num(raw.ac); if (ac !== null) d.acDelta = ac;
  if (raw.currency && typeof raw.currency === 'object') {
    const c: any = {};
    for (const k of ['cp','sp','ep','gp','pp']) {
      const v = num(raw.currency[k]);
      if (v !== null) c[k] = v;
    }
    if (Object.keys(c).length) d.currencyDelta = c;
  }
  if (Array.isArray(raw.itemsAdd)) {
    d.itemsAdd = raw.itemsAdd
      .filter((x: any) => x && typeof x.name === 'string')
      .map((x: any) => ({
        name: String(x.name).slice(0, 80),
        qty: Math.max(1, num(x.qty) ?? 1),
        meta: x.meta && typeof x.meta === 'object' ? sanitizeItemMeta(x.meta) : undefined
      }))
      .slice(0, 20);
  }
  if (Array.isArray(raw.itemsRemove)) {
    d.itemsRemove = raw.itemsRemove
      .filter((x: any) => x && typeof x.name === 'string')
      .map((x: any) => ({ name: String(x.name).slice(0, 80), qty: Math.max(1, num(x.qty) ?? 1) }))
      .slice(0, 20);
  }
  if (Array.isArray(raw.conditionsAdd)) {
    d.conditionsAdd = raw.conditionsAdd
      .filter((x: any) => x && typeof x.name === 'string')
      .map((x: any) => ({
        name: String(x.name).slice(0, 60),
        kind: ['buff','debuff','condition'].includes(x.kind) ? x.kind : 'condition',
        description: typeof x.description === 'string' ? x.description.slice(0, 200) : undefined
      }))
      .slice(0, 10);
  }
  if (Array.isArray(raw.conditionsRemove)) {
    d.conditionsRemove = raw.conditionsRemove.filter((x: any) => typeof x === 'string').map((s: string) => s.slice(0, 60)).slice(0, 10);
  }
  if (Array.isArray(raw.spellSlotsUse)) {
    d.spellSlotsUse = raw.spellSlotsUse
      .filter((x: any) => x && num(x.level) !== null && num(x.count) !== null)
      .map((x: any) => ({
        level: Math.max(0, Math.min(9, num(x.level)!)),
        count: Math.max(-9, Math.min(9, num(x.count)!))
      }))
      .slice(0, 9);
  }
  if (Array.isArray(raw.npcsIntroduced)) {
    d.npcsIntroduced = raw.npcsIntroduced
      .filter((x: any) => x && typeof x.name === 'string' && typeof x.role === 'string')
      .map((x: any) => ({
        name: String(x.name).slice(0, 80),
        role: String(x.role).slice(0, 80),
        description: typeof x.description === 'string' ? x.description.slice(0, 400) : '',
        disposition: ['friendly','neutral','hostile','unknown'].includes(x.disposition) ? x.disposition : 'unknown',
        race: typeof x.race === 'string' ? x.race.slice(0, 60) : undefined,
        location: typeof x.location === 'string' ? x.location.slice(0, 60) : undefined
      }))
      .slice(0, 5);
  }
  const exp = num(raw.exp); if (exp !== null && exp > 0) d.exp = exp;
  if (raw.levelUp === true || raw.levelUp === 'true') d.levelUp = true;
  if (typeof raw.notes === 'string') d.notes = raw.notes.slice(0, 300);
  return d;
};

const sanitizeItemMeta = (m: any) => {
  const out: any = {};
  const weight = num(m.weight); if (weight !== null) out.weight = weight;
  const cost = num(m.cost); if (cost !== null) out.cost = cost;
  if (ALLOWED_CATEGORIES.has(m.category)) out.category = m.category;
  if (ALLOWED_DAMAGE.has(m.damageType)) out.damage = { dice: String(m.dice || '1d4'), type: m.damageType };
  const itemAc = num(m.ac); if (itemAc !== null) out.ac = itemAc;
  if (Array.isArray(m.properties)) out.properties = m.properties.filter((x: any) => typeof x === 'string').slice(0, 8);
  if (typeof m.rarity === 'string') out.rarity = m.rarity;
  return Object.keys(out).length ? out : undefined;
};

export const toolCallToDelta = (args: any): StateDelta | null => {
  try {
    const d = sanitize(unwrapState(typeof args === 'string' ? JSON.parse(args) : args));
    return isEmptyDelta(d) ? null : d;
  } catch {
    return null;
  }
};

export const STATE_DELTA_TOOL = {
  type: 'function',
  function: {
    name: 'update_character_state',
    description: 'Apply a state change to the player character. Use this whenever the narrative affects HP, currency, inventory, conditions, spell slots, XP, OR when a brand-new NPC is introduced. Call once per message, only with fields that actually changed.',
    parameters: {
      type: 'object',
      properties: {
        hp: { type: 'integer', description: 'HP change (negative for damage, positive for healing). Damage always consumes temp HP first â€” just send the total; the app handles the math. Leave absent if unchanged.' },
        tempHp: { type: 'integer', description: 'Temporary HP change: positive grants temp HP, negative removes it (rare).' },
        hpMax: { type: 'integer', description: 'Permanent max-HP change (drain, blessing, level adjustments). Rare.' },
        ac: { type: 'integer', description: 'Set AC to this value (only if it should change).' },
        currency: {
          type: 'object',
          properties: { cp: { type: 'integer' }, sp: { type: 'integer' }, ep: { type: 'integer' }, gp: { type: 'integer' }, pp: { type: 'integer' } }
        },
        itemsAdd: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              qty: { type: 'integer' },
              meta: { type: 'object' }
            },
            required: ['name']
          }
        },
        itemsRemove: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'integer' } }, required: ['name'] }
        },
        conditionsAdd: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['buff','debuff','condition'] }, description: { type: 'string' } },
            required: ['name','kind']
          }
        },
        conditionsRemove: { type: 'array', items: { type: 'string' } },
        spellSlotsUse: { type: 'array', description: 'Positive count = slot spent. Negative count = slot refunded (e.g. rest, arcane recovery).', items: { type: 'object', properties: { level: { type: 'integer' }, count: { type: 'integer' } }, required: ['level','count'] } },
        exp: { type: 'integer', description: 'XP awarded to the player for this turn (0â€“300 typical for a small win; bigger for milestones). The app levels the hero automatically.' },
        levelUp: { type: 'boolean', description: 'Rarely true on milestones â€” the app recomputes the sheet, grants a hit-die roll, and updates spell slots.' },
        npcsIntroduced: {
          type: 'array',
          description: 'New NPCs the player meets for the first time in this session. Include only NPCs being introduced NOW (not previously met).',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Full name of the NPC.' },
              role: { type: 'string', description: 'Their occupation, role, or social position (e.g. "Innkeeper", "Town guard", "Mysterious hooded stranger").' },
              description: { type: 'string', description: 'Physical appearance, mannerisms, notable features.' },
              disposition: { type: 'string', enum: ['friendly','neutral','hostile','unknown'], description: 'Default attitude toward the party.' },
              race: { type: 'string', description: 'Race/species if relevant.' },
              location: { type: 'string', description: 'Where the player meets them.' }
            },
            required: ['name', 'role']
          }
        },
        notes: { type: 'string' }
      }
    }
  }
} as const;
