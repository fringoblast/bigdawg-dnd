import { uid } from './storage';

// Pollinations.ai — public, free, no API key. The model + dimensions + seed are URL params.
// We never proxy through our app; the browser fetches directly via <img src=...>. Zero storage cost
// and the seed parameter makes the URL deterministic so the same prompt yields the same image.

export type Aspect = 'square' | 'portrait' | 'wide';

const ENDPOINT = 'https://image.pollinations.ai/prompt/';

interface UrlOptions {
  width?: number;
  height?: number;
  seed?: number | string;
  model?: 'flux' | 'turbo';
  nologo?: boolean;
  enhance?: boolean;
}

const buildUrl = (prompt: string, opts: UrlOptions = {}): string => {
  const enc = encodeURIComponent(prompt.trim().slice(0, 480));
  const w = opts.width ?? 512;
  const h = opts.height ?? 512;
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  const model = opts.model ?? 'flux';
  const params = [
    `width=${w}`,
    `height=${h}`,
    `seed=${seed}`,
    `model=${model}`,
    `nologo=${opts.nologo === false ? 'false' : 'true'}`,
    opts.enhance ? 'enhance=true' : 'enhance=false'
  ].join('&');
  return `${ENDPOINT}${enc}?${params}`;
};

// Used by the portrait generation to keep identity consistent across regenerations.
// Generates a 32-bit hash from the inputs so the same hero re-rolls the same image if you keep the seed.
const hashSeed = (parts: (string | number | undefined | null)[]): string => {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p ?? '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return String(h >>> 0);
};

export interface PortraitInputs {
  name: string;
  race: string;
  klass: string;
  level: number;
  gender?: string;
  appearance?: string;
  toneMood?: string; // 'light' | 'dark' | 'gritty' etc.
}

/**
 * Prompt for an AI character portrait. Deterministic seed derived from hero identity so
 * regenerations stay consistent (or vary if user wants a new look).
 */
export const buildPortraitPrompt = (inp: PortraitInputs, opts?: { variant?: number }): string => {
  const tags = [
    'fantasy role-playing game character portrait',
    'painterly digital art',
    'face and upper torso',
    'single subject',
    'centered composition',
    `${inp.race || 'human'} ${inp.klass || 'adventurer'}`,
    inp.appearance ? `appearance: ${inp.appearance.slice(0, 200)}` : 'worn leather armor, traveling gear',
    'dramatic lighting, dark moody background',
    'no text, no watermark, no UI'
  ];
  if (opts?.variant) tags.push(`variation ${opts.variant}`);
  return tags.join(', ');
};

/**
 * Returns a portrait URL that hotlinks directly from Pollinations. Stable seed when `keepSeed` is true.
 */
export const portraitUrl = (inp: PortraitInputs, opts?: { keepSeed?: boolean; variant?: number }): string => {
  const seed = opts?.keepSeed ? hashSeed([inp.name, inp.race, inp.klass, opts.variant ?? 0]) : undefined;
  return buildUrl(buildPortraitPrompt(inp, opts), {
    width: 512,
    height: 512,
    seed,
    model: 'flux'
  });
};

export interface SceneInputs {
  tone?: string;
  locationHint?: string;
  weatherHint?: string;
  recentNarration?: string;
  characterTraits?: string;
  variant?: number;
}

/**
 * Prompt for a scene background. Aimed at a wide, low-detail atmospheric piece so it can
 * sit as a soft backdrop behind chat bubbles without obscuring text.
 */
export const buildScenePrompt = (inp: SceneInputs): string => {
  const tone = (inp.tone || 'neutral').toLowerCase();
  const moodMap: Record<string, string> = {
    'light': 'sun-dappled, warm golden hour, hopeful, pastoral',
    'dark': 'moonlit, misty, gothic, eerie shadows, deep blue-grey',
    'gritty': 'rainy, smoke, neon signs of a corrupt city, harsh contrast',
    'epic': 'vast horizon, golden god-rays, towering citadels on cliffs',
    'whimsical': 'pastel skies, candy-coloured spires, sprites and lanterns, soft glow',
    'classic': 'warm torchlight, stone halls, oil-painting tavern aesthetic'
  };
  const baseMood = moodMap[tone] || 'cinematic fantasy atmosphere, soft natural light, painterly';
  const location = inp.locationHint ? `${inp.locationHint},` : 'fantasy environment,';
  const weather = inp.weatherHint || '';
  const recent = inp.recentNarration ? `recent scene: ${inp.recentNarration.slice(0, 150)}` : '';
  const tags = [
    'wide cinematic fantasy landscape',
    'no characters',
    'no text',
    'no watermark',
    'no UI',
    'soft painterly brushwork',
    baseMood,
    location,
    weather,
    recent,
    inp.characterTraits ? `protagonist mood: ${inp.characterTraits.slice(0, 80)}` : ''
  ].filter(Boolean);
  return tags.join(', ');
};

export const sceneUrl = (inp: SceneInputs, opts?: { keepSeed?: boolean; width?: number; height?: number }): string => {
  const seed = opts?.keepSeed
    ? hashSeed([inp.tone, inp.locationHint, inp.weatherHint, inp.recentNarration?.slice(0, 80), inp.variant ?? 0])
    : undefined;
  return buildUrl(buildScenePrompt(inp), {
    width: opts?.width ?? 1024,
    height: opts?.height ?? 768,
    seed,
    model: 'flux'
  });
};

/**
 * Loads an image via fetch to ensure Pollinations actually returned the bytes (some prompts fail silently),
 * then converts to a data URL for offline-friendly caching. Used by save-blob cache so a scene-art survives reload.
 * Returns null on any failure — caller should fall back to the original URL.
 */
export const fetchImageAsBlob = async (url: string): Promise<Blob | null> => {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return blob;
  } catch {
    return null;
  }
};

/**
 * Quick non-blocking availability test for the Pollinations endpoint. Used by Settings "Test" button.
 */
export const testPollinations = async (): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
  const t0 = Date.now();
  try {
    const url = buildUrl('test '+uid(), { width: 64, height: 64, seed: 1, model: 'turbo' });
    const res = await fetch(url, { mode: 'cors' });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    return { ok: true, latencyMs };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - t0, error: e?.message || 'network error' };
  }
};
