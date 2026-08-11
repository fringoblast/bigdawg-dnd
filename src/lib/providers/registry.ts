import type { ChatProvider, ProviderId } from './types';
import { openrouterProvider } from './openrouter';
import { groqProvider } from './groq';
import { cerebrasProvider } from './cerebras';
import { nimProvider } from './nim';
import { pollinationsProvider } from './pollinations';
import { isCustomProviderId, makeCustomProvider, type CustomProviderConfig } from './custom';

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  badge: string;
  description: string;
  /** Recognised string prefixes that auto-route a pasted key to this provider. */
  keyPrefixes: string[];
  /** When true, the provider also accepts any opaque alphanumeric token that
   *  doesn't start with a known prefix. Used by NVIDIA NIM because NVIDIA Build
   *  sometimes hands back the credential *value* (a long random-looking string)
   *  instead of the `nvapi-…` prefixed form. Tap "Test" to verify. */
  keyAnyShape?: boolean;
  keyPlaceholder: string;
  keyHint: string;
  defaultModel: string;
  /** Requests per minute cap we'll apply client-side. null = no throttle. */
  ratePerMinute: number | null;
  capabilities: { streaming: boolean; toolCalls: boolean; vision: boolean };
  modelListNote?: string;
  requiresKey: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    badge: 'Most models',
    description: 'Unified API for hundreds of models. Free tier on selected models.',
    keyPrefixes: ['sk-or-'],
    keyPlaceholder: 'sk-or-v1-…',
    keyHint: 'Get a free key at openrouter.ai. Stored locally only.',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    ratePerMinute: 30,
    capabilities: { streaming: true, toolCalls: true, vision: true },
    requiresKey: true
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    badge: 'Free · fast',
    description: 'Free tier: 30 req/min, ~14,400 req/day. No credit card. ~315 tok/s.',
    keyPrefixes: ['gsk_'],
    keyPlaceholder: 'gsk_…',
    keyHint: 'Get a free key at console.groq.com. Stored locally only.',
    defaultModel: 'openai/gpt-oss-120b',
    ratePerMinute: 30,
    capabilities: { streaming: true, toolCalls: true, vision: false },
    requiresKey: true
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    badge: 'Free · ultra-fast',
    description: 'Free Llama 3.3 70B & Qwen 2.5 72B. Same OpenAI-compatible API as Groq. ~2000 tok/s.',
    keyPrefixes: ['csk-'],
    keyPlaceholder: 'csk-…',
    keyHint: 'Get a free key at cloud.cerebras.ai (one-click Google sign-up). Stored locally only.',
    defaultModel: 'llama-3.3-70b',
    ratePerMinute: 30,
    capabilities: { streaming: true, toolCalls: true, vision: false },
    requiresKey: true
  },
  nim: {
    id: 'nim',
    label: 'NVIDIA NIM',
    badge: 'Free · GLM 5.2',
    description: 'NVIDIA-hosted inference via build.nvidia.com. Default: z-ai/glm-5.2 (verified free endpoint on build.nvidia.com). Also Llama 3.3 70B, Llama 3.1 70B, Mistral, Qwen, Gemma, Nemotron. 5,000 free credits/month per model. Auto-throttled to 40 req/min to stay inside the free tier. Requests are proxied through a server-side Netlify Function so the browser can call NVIDIA without hitting a CORS wall.',
    keyPrefixes: ['nvapi-'],
    keyAnyShape: true,
    keyPlaceholder: 'nvapi-…  (paste the whole key, hyphens and all)',
    keyHint: 'Get a free key at build.nvidia.com (open any model → "Get API Key"). Paste the key VERBATIM — NVIDIA accepts the internal hyphens exactly as displayed. Stored locally only.',
    defaultModel: 'z-ai/glm-5.2',
    ratePerMinute: 40,
    capabilities: { streaming: true, toolCalls: true, vision: false },
    requiresKey: true
  },
  pollinations: {
    id: 'pollinations',
    label: 'Pollinations',
    badge: 'Unlimited · no key',
    description: 'Truly anonymous, no signup, no API key. Quality is mixed (best with openai-fast / mistral). Slower than Groq — responses are chunked to fake streaming.',
    keyPrefixes: [],
    keyPlaceholder: '(no key needed)',
    keyHint: 'Completely open. Nothing is sent anywhere except Pollinations’ public endpoint.',
    defaultModel: 'openai-fast',
    ratePerMinute: null,
    capabilities: { streaming: true, toolCalls: false, vision: false },
    modelListNote: 'No /models endpoint — curated list of known-good text models.',
    requiresKey: false
  }
};

export const PROVIDER_IDS: ProviderId[] = ['openrouter', 'groq', 'cerebras', 'nim', 'pollinations'];

const REGISTRY: Record<ProviderId, ChatProvider> = {
  openrouter: openrouterProvider,
  groq: groqProvider,
  cerebras: cerebrasProvider,
  nim: nimProvider,
  pollinations: pollinationsProvider
};

export function pickProvider(id: ProviderId, customProviders: CustomProviderConfig[] = []): ChatProvider {
  if (id in REGISTRY) return REGISTRY[id as keyof typeof REGISTRY];
  if (isCustomProviderId(id)) {
    const cfg = customProviders.find(c => c.id === id);
    if (cfg) return makeCustomProvider(cfg);
  }
  return openrouterProvider;
}

export function defaultModelFor(id: ProviderId): string {
  // Custom providers have no baked-in default — the model scroller/auto-pick fills it in.
  if (isCustomProviderId(id)) return '';
  return PROVIDERS[id]?.defaultModel || PROVIDERS.openrouter.defaultModel;
}

export function detectProviderByKey(key: string): ProviderId | null {
  const k = (key || '').trim();
  if (!k) return null; // never auto-detect from an empty key — user must pick pollinations explicitly
  // 1) explicit prefix wins
  for (const id of PROVIDER_IDS) {
    const prefixes = PROVIDERS[id].keyPrefixes;
    if (prefixes && prefixes.some(p => k.startsWith(p))) return id;
  }
  // 2) opaque fallback: providers that explicitly opt in (NIM) accept any
  //    plausible-looking API key (long alphanumeric / dash / underscore token),
  //    because NVIDIA Build sometimes returns just the credential value
  //    without the documented `nvapi-` prefix. The user always verifies with Test.
  // Skip if the key obviously belongs to a foreign provider we don't support
  // — avoids silently mis-routing an OpenAI/Anthropic/GitHub etc. key to NIM.
  const FOREIGN_PREFIXES = /\b(sk-ant-|sk-|ghp_|gho_|ghu_|ghs_|xai-|pplx-|AIza)/;
  if (
    k.length >= 20 &&
    /^[A-Za-z0-9_\-\.]+$/.test(k) &&
    !FOREIGN_PREFIXES.test(k)
  ) {
    for (const id of PROVIDER_IDS) {
      if (PROVIDERS[id].keyAnyShape) return id;
    }
  }
  return null;
}
