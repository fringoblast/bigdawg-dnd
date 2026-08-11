// Shared per-provider send throttle. Used by StoryTab (D&D), ChatShell (chat),
// and dmAutoTrigger so a 30 req/min Groq cap or a 40 req/min NVIDIA NIM cap
// can't be bypassed by switching modes mid-flight. Sliding 60-second window
// per provider — matches the documented free-tier caps (NVIDIA NIM's build.nvidia.com
// caps free models at 40 requests/min, Groq/Cerebras/OpenRouter free tiers ~30).
//
// Single source of truth: caps live on PROVIDERS[*].ratePerMinute in registry.ts
// so the Settings UI can show them too. Single-tab, in-memory only — real
// back-pressure from the upstream API is what really protects your quota; this
// just keeps the UI from spamming sends faster than the upstream will accept.
import { PROVIDERS } from './providers/registry';

const RECENT: Record<string, number[]> = {};
const WINDOW_MS = 60_000;

// Derived once at module load. null = no throttle (Pollinations).
const LIMIT_PER_MIN: Record<string, number | null> = Object.fromEntries(
  Object.values(PROVIDERS).map(p => [p.id, p.ratePerMinute])
);

function pruneAndGet(provider: string): number[] {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  let arr = RECENT[provider];
  if (!arr) {
    arr = RECENT[provider] = [];
  } else if (arr.length) {
    // Drop expired timestamps from the front (they're in chronological order).
    let i = 0;
    while (i < arr.length && arr[i] <= cutoff) i++;
    if (i) arr.splice(0, i);
  }
  return arr;
}

/** Returns true if the caller may proceed, false if the per-minute cap is filled. */
export const canSendNow = (provider: string): boolean => {
  const limit = LIMIT_PER_MIN[provider];
  if (limit == null) return true;
  const recent = pruneAndGet(provider);
  if (recent.length >= limit) return false;
  recent.push(Date.now());
  return true;
};

/** How many milliseconds until the next slot frees up. 0 if a slot is available now. */
export const msUntilNextSlot = (provider: string): number => {
  const limit = LIMIT_PER_MIN[provider];
  if (limit == null) return 0;
  const recent = pruneAndGet(provider);
  if (recent.length < limit) return 0;
  // The oldest of the `limit` most-recent timestamps will fall outside the
  // 60s window at recent[limit - 1] + WINDOW_MS.
  return Math.max(0, recent[limit - 1] + WINDOW_MS - Date.now());
};

/** Human-readable wait like "12s" / "2m 5s" — empty if no wait needed. */
export const waitLabel = (provider: string): string => {
  const ms = msUntilNextSlot(provider);
  if (ms <= 0) return '';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs ? `${m}m ${rs}s` : `${m}m`;
};

/** Look up the cap for a provider (matches PROVIDERS[*].ratePerMinute in the registry). */
export const rateLimitFor = (provider: string): number | null => LIMIT_PER_MIN[provider] ?? null;

export const _resetProviderThrottle = () => {
  for (const k of Object.keys(RECENT)) delete RECENT[k];
};
