import type { ChatChunk, ChatProvider, ChatRequest, ModelInfo } from './types';
import { ProviderError } from './shared';

// Browser CORS friendly path. Calls land in netlify/functions/nim.ts (a
// server-side proxy), which forwards to https://integrate.api.nvidia.com/v1/*
// on behalf of the browser. NVIDIA's hosted NIM does NOT send
// Access-Control-Allow-Origin headers, so direct browser fetch() with our
// `Bearer` token otherwise fails the CORS check and surfaces as a red
// "load failed" toast. The proxy keeps the same Authorization flow: client
// sends `Authorization: Bearer <key>`, the proxy re-uses that header upstream.
// During `npm run dev`, vite.config.ts proxies this path locally so CORS
// doesn't bite there either.
const BASE_URL = '/.netlify/functions/nim';

// Version string baked into the dist via the build step. The README + DEPLOY.md
// suggest bumping this if you ship a breaking fix so the SW cache busts.
// Inlined here so the bundle self-documents its deployed version.
const PROXY_VERSION = 'v0.6.1-nim-stable';

// Curated NVIDIA Build catalog. Used as a fallback when /v1/models returns
// 404 / empty (e.g. NVIDIA has restricted the public catalog for some
// accounts) so the user always sees a tappable model list instead of an empty
// dropdown. Index 0 is the default in registry.ts — keep in sync.
//
// Validated against NVIDIA Build's free tier as of mid-2025. Models NVIDIA
// removes from the free tier will return 404 in chat; the chatStream retries
// against subsequent entries automatically.
const CURATED_NVIDIA_MODELS: Array<{ id: string; name: string; contextLength?: number }> = [
  { id: 'z-ai/glm-5.2', name: 'GLM 5.2 (free endpoint)', contextLength: 16384 },
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', contextLength: 131072 },
  { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct', contextLength: 131072 },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', contextLength: 131072 },
  { id: 'mistralai/mistral-large-2-instruct', name: 'Mistral Large 2 123B', contextLength: 128000 },
  { id: 'mistralai/mistral-nemotron-12b', name: 'Mistral Nemotron 12B', contextLength: 32768 },
  { id: 'mistralai/mixtral-8x22b-instruct', name: 'Mixtral 8x22B Instruct', contextLength: 65536 },
  { id: 'qwen/qwen2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct', contextLength: 32768 },
  { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B IT', contextLength: 8192 },
  { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B IT', contextLength: 8192 },
  { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 4 340B Instruct', contextLength: 4096 }
];

/**
 * Sanitize a pasted NVIDIA Build / NVAPI key. Conserve-as-is: just strip
 * paste-wrapper noise; NEVER alter the key body itself.
 *
 * Lesson learned (do NOT revert): the build.nvidia.com "Copy" button hands
 * back keys WITH internal visual hyphens like
 *   `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`
 * Internal hyphens are PART of the API token. An earlier revision stripped
 * them and produced an invalid token — verified via direct curl: raw key
 * with hyphens returns HTTP 200, stripped returns HTTP 403. So we now
 * preserve the key exactly as-is and only strip wrapping noise (BOM, leading
 * "API Key:", trailing punctuation, surrounding quotes, embedded whitespace)
 * that users paste from docs / chat messages / copy-as-text pastes.
 */
function sanitizeKey(raw: string): string {
  if (!raw) return '';
  let s = raw;
  // BOM and zero-width chars that copy-paste sometimes drags in.
  s = s.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '');
  // Strip a leading "API key:" / "Key:" label some paste contexts add.
  s = s.replace(/^\s*(?:api\s*key|key)\s*[:=]\s*/i, '');
  // Surrounding quotes (rare but happens with copy-as-text).
  s = s.replace(/^["'`]+|["'`]+$/g, '');
  // Internal whitespace and linebreaks from wrapped / markdown copies.
  // IMPORTANT: do NOT touch hyphens — those are part of the token.
  s = s.replace(/\s+/g, '');
  return s.trim();
}

function authHeaders(rawKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${sanitizeKey(rawKey)}`,
    'Content-Type': 'application/json'
  };
}

function curatedList(): ModelInfo[] {
  return CURATED_NVIDIA_MODELS
    .map(m => ({
      id: m.id,
      name: m.name,
      provider: 'nim',
      contextLength: m.contextLength,
      isFree: true,
      raw: { curated: true }
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Bound a fetch with a server-side timeout so a hung NVIDIA never wedges
// the UI timer. The caller's signal still wins if present.
function fetchWithTimeout(input: string, init: RequestInit, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const signal = init.signal ?? ctrl.signal;
  return fetch(input, { ...init, signal }).finally(() => {
    clearTimeout(timer);
  });
}

// NIM lists a few non-chat endpoints (embeddings, rerankers, image models, etc.). Filter them out.
const CHAT_MODEL_DENYLIST = /embed|rerank|image|vision|guard|safety|cosmos|parakeet|whisper|tts|neva-/i;

// Tiny probe: do a one-token chat completion against the default model.
// Used by testKey when /v1/models returns 404 to confirm the key still has
// inference access.
async function probeChatKey(rawKey: string, signal?: AbortSignal): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(rawKey),
      body: JSON.stringify({
        model: CURATED_NVIDIA_MODELS[0].id,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false
      }),
      signal
    });
    if (r.ok) return { ok: true };
    let body = '';
    try { body = (await r.text()).slice(0, 240); } catch { /* ignore */ }
    return { ok: false, status: r.status, error: `HTTP ${r.status}${body ? ` · ${body.replace(/\s+/g, ' ').slice(0, 120)}` : ''}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

// One streaming attempt against a specific model. Returns:
//   - kind: 'ok'       -> stream completed cleanly; caller returns.
//   - kind: 'fatal'    -> account-level error (401/403/429); caller yields
//                         the error and stops retrying.
//   - kind: 'retry'    -> model-level error (404, 5xx, etc.); caller tries
//                         the next model.
async function* streamOneModel(
  req: ChatRequest,
  rawKey: string,
  signal: AbortSignal
): AsyncGenerator<ChatChunk, { kind: 'ok' | 'fatal' | 'retry'; error?: { status?: number; message: string; body?: string } }> {
  let r: Response;
  try {
    r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(rawKey),
      body: JSON.stringify({ ...req, stream: true }),
      signal
    });
  } catch (e: any) {
    return { kind: 'fatal', error: { message: e?.message || 'Network error' } };
  }
  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '');
    if (r.status === 401 || r.status === 403 || r.status === 429) {
      return { kind: 'fatal', error: { status: r.status, message: `NIM ${r.status}`, body: text.slice(0, 240) } };
    }
    return { kind: 'retry', error: { status: r.status, message: `NIM ${r.status}`, body: text.slice(0, 240) } };
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const toolCalls: { id: string; index: number; function: { name: string; arguments: string } }[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta;
        if (delta?.content) yield { type: 'content', content: delta.content };
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            let bucket = toolCalls.find(t => t.index === idx);
            if (!bucket) { bucket = { id: tc.id || '', index: idx, function: { name: '', arguments: '' } }; toolCalls.push(bucket); }
            if (tc.id) bucket.id = tc.id;
            if (tc.function?.name) bucket.function.name = tc.function.name;
            if (tc.function?.arguments) bucket.function.arguments += tc.function.arguments;
          }
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }
  if (toolCalls.length) yield { type: 'tool_calls', toolCalls };
  yield { type: 'done' };
  return { kind: 'ok' };
}

export const nimProvider: ChatProvider = {
  id: 'nim',

  async listModels(key, signal) {
    // GET /v1/models may return 404 (some accounts) or empty. In that case we
    // serve the curated catalog so the selector is never empty. BUT: if the
    // error is 401 / 403 (invalid key), we MUST surface that — silently
    // falling back would let the user pick a model and burn quota on a key
    // that won't work.
    try {
      const r = await fetchWithTimeout(`${BASE_URL}/models`, { headers: authHeaders(key) }, 12_000);
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        const arr = (d?.data || []) as any[];
        if (arr.length > 0) {
          return arr
            .filter((m: any) => !CHAT_MODEL_DENYLIST.test(m.id || ''))
            .map((m: any) => ({
              id: m.id,
              name: m.id,
              provider: 'nim',
              contextLength: m.context_window || m.max_input_tokens || m.context_length,
              isFree: true,
              raw: m
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
        }
        // Catalog returned 200 but data is empty — fall back to curated.
      } else if (r.status === 401 || r.status === 403) {
        let body = '';
        try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
        throw new ProviderError(
          `NVIDIA NIM key rejected (HTTP ${r.status})${body ? ` · ${body.replace(/\s+/g, ' ').slice(0, 100)}` : ''}`,
          r.status
        );
      } else if (r.status !== 404 && r.status !== 500) {
        // Some other 4xx — surface it so the user knows.
        let body = '';
        try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
        throw new ProviderError(
          `NVIDIA NIM /models HTTP ${r.status}${body ? ` · ${body.replace(/\s+/g, ' ').slice(0, 100)}` : ''}`,
          r.status
        );
      }
      // 404 / 500 / empty / network -> curated fallback (handled below)
    } catch (e) {
      // ProviderError intentionally re-thrown — chat-store updates models.error
      // and surfaces the diagnostic in the UI.
      if (e instanceof ProviderError) throw e;
      // Network failures -> curated fallback (we still want a tappable dropdown)
    }
    return curatedList();
  },

  async testKey(key) {
    const t0 = performance.now();
    if (!key || !key.trim()) return { ok: false, error: 'No key supplied' };
    const cleaned = sanitizeKey(key);
    if (cleaned.length < 25) return { ok: false, error: 'Key looks too short — check for missing characters' };

    // Primary path: cheap /v1/models probe.
    try {
      const r = await fetchWithTimeout(`${BASE_URL}/models`, { headers: authHeaders(key) }, 10_000);
      if (r.ok) return { ok: true, latencyMs: Math.round(performance.now() - t0) };

      // 404 on /models means the Netlify Function at /v1/models is NOT
      // deployed (the dist bundle was uploaded but the proxy went with it
      // on a Trim or the drop didn't pick up netlify/functions/nim.ts).
      // Surface this very loudly so the user knows the issue is *deploy* not key.
      if (r.status === 404) {
        // Quick sanity probe: was the request even routed to our proxy?
        // We always set Access-Control-Allow-Origin, so if that header is
        // absent the request never hit the function.
        const acao = r.headers.get('access-control-allow-origin');
        const missingProxy = !acao || !acao.includes('*');
        return {
          ok: false,
          error: missingProxy
            ? `Function proxy not deployed. Drop the *parent folder* of dist/ onto Netlify (one containing both dist/ AND netlify/functions/), or check netlify.toml.`
            : `Catalog 404 upstream (NVIDIA may have changed /v1/models). Probe anyway?`,
          latencyMs: Math.round(performance.now() - t0)
        };
      }

      // 401/403 -> the key is invalid for this account, don't bother probing.
      if (r.status === 401 || r.status === 403) {
        let body = '';
        try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
        return {
          ok: false,
          error: `Key rejected (HTTP ${r.status})${body ? ` · ${body.replace(/\s+/g, ' ').slice(0, 100)}` : ''}`,
          latencyMs: Math.round(performance.now() - t0)
        };
      }
      // 5xx (other than 500): catalog endpoint is unavailable. Probe a
      // one-token chat completion so the user knows whether the key works.
      const probe = await probeChatKey(key);
      if (probe.ok) return { ok: true, latencyMs: Math.round(performance.now() - t0) };
      return {
        ok: false,
        error: probe.error || `catalog HTTP ${r.status} · probe also failed`,
        latencyMs: Math.round(performance.now() - t0)
      };
    } catch (e: any) {
      // Network-layer failure: usually CORS or proxy missing. Diagnose
      // with a helpful hint so the user knows what to do.
      const msg = String(e?.message || 'Network error');
      if (msg.includes('Failed to fetch') || msg.includes('Load failed')) {
        return { ok: false, error: `Network/CORS failure — proxy may not be deployed. Drop the parent folder (containing dist/ AND netlify/functions/) onto Netlify.` };
      }
      return { ok: false, error: msg };
    }
  },

  async *chatStream(req, key, signal): AsyncIterable<ChatChunk> {
    // When the picked model 404s (user selected a stale / removed id, OR /v1/models
    // returned something that's gone), retry against up to 2 known-good models
    // from the curated list. We DO NOT inject visible retry announcements into
    // the assistant content (would break downstream parsers); if all retries
    // fail we yield one diagnostic error at the end.
    const candidates = [req.model, ...CURATED_NVIDIA_MODELS.map(m => m.id).filter(id => id !== req.model)].slice(0, 3);
    let lastError: { status?: number; message: string; body?: string } | null = null;

    for (const candidate of candidates) {
      if (!candidate) continue;
      const result = yield* streamOneModel({ ...req, model: candidate }, key, signal);
      if (result.kind === 'ok') return;
      if (result.kind === 'fatal') {
        // Account-level failure — no point retrying other models.
        yield { type: 'error', error: result.error || { message: 'Account-level error' } };
        return;
      }
      // 'retry' — model-level issue, try the next candidate silently.
      lastError = result.error || lastError;
    }
    yield {
      type: 'error',
      error: lastError || { message: 'No NVIDIA NIM models responded. Try a different model.' }
    };
  }
};
