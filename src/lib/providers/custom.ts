import type { ChatChunk, ChatProvider, ChatRequest, ChatTool, ModelInfo } from './types';
import { ProviderError } from './shared';

export type CustomProviderType = 'openai' | 'anthropic';

export interface CustomProviderConfig {
  id: string;
  type: CustomProviderType;
  label: string;
  baseUrl: string;
  apiKey: string;
  createdAt: number;
  /** undefined = auto (https remote bases route through the Netlify proxy). */
  useProxy?: boolean;
}

export const CUSTOM_PREFIX = 'custom-';

export const isCustomProviderId = (id: string): boolean => id.startsWith(CUSTOM_PREFIX);

const stripTrailingSlash = (u: string): string => u.trim().replace(/\/+$/, '');

// ---------- proxy routing ----------

const PROXY_PATH = '/.netlify/functions/dnd-proxy';

export const shouldUseProxy = (cfg: Pick<CustomProviderConfig, 'useProxy' | 'baseUrl'>): boolean => {
  if (cfg.useProxy === true) return true;
  if (cfg.useProxy === false) return false;
  // Auto: https, non-local host → route through the same-origin proxy (CORS-safe).
  try {
    const u = new URL(cfg.baseUrl.trim());
    if (u.protocol !== 'https:') return false;
    return !/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)/.test(u.hostname);
  } catch {
    return false;
  }
};

const normalizeBase = (raw: string, type: CustomProviderType): string => {
  let b = stripTrailingSlash(raw.trim());
  // Anthropic: if the user already included /v1, don't double it later.
  if (type === 'anthropic' && /\/v1$/.test(b)) b = b.slice(0, -3);
  return b;
};

const buildEndpoint = (cfg: CustomProviderConfig, suffix: string): string => {
  const base = normalizeBase(cfg.baseUrl, cfg.type);
  const direct = cfg.type === 'anthropic' ? `${base}/v1/${suffix}` : `${base}/${suffix}`;
  if (!shouldUseProxy(cfg)) return direct;
  return `${PROXY_PATH}?base=${encodeURIComponent(base)}&path=${encodeURIComponent(suffix)}`;
};

// ---------- shared OpenAI-compatible SSE parser (also used by the built-in providers) ----------

export const openAiCompatChatStream = async function* (
  baseUrl: string,
  req: ChatRequest,
  key: string,
  signal: AbortSignal,
  label: string,
  endpoint?: string
): AsyncIterable<ChatChunk> {
  let r: Response;
  try {
    r = await fetch(endpoint || `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, stream: true }),
      signal
    });
  } catch (e: any) {
    yield { type: 'error', error: { message: e?.message || 'Network error' } };
    return;
  }
  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '');
    yield { type: 'error', error: { status: r.status, message: `${label} ${r.status}`, body: text } };
    return;
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
};

// ---------- Anthropic Messages API implementation ----------

const ANTHROPIC_VERSION = '2023-06-01';

const anthropicHeaders = (key: string): Record<string, string> => ({
  'x-api-key': key,
  'anthropic-version': ANTHROPIC_VERSION,
  'Content-Type': 'application/json'
});

const anthropicTool = (t: ChatTool) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters || { type: 'object', properties: {} }
});

const anthropicBody = (req: ChatRequest) => {
  const system = req.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const messages = req.messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));
  return {
    model: req.model,
    max_tokens: req.max_tokens || 900,
    messages,
    ...(system ? { system } : {}),
    ...(req.tools?.length ? { tools: req.tools.map(anthropicTool) } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    stream: true
  };
};

const anthropicChatStream = async function* (
  baseUrl: string,
  req: ChatRequest,
  key: string,
  signal: AbortSignal,
  label: string,
  endpoint?: string
): AsyncIterable<ChatChunk> {
  let r: Response;
  try {
    r = await fetch(endpoint || `${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(key),
      body: JSON.stringify(anthropicBody(req)),
      signal
    });
  } catch (e: any) {
    yield { type: 'error', error: { message: e?.message || 'Network error' } };
    return;
  }
  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '');
    yield { type: 'error', error: { status: r.status, message: `${label} ${r.status}`, body: text } };
    return;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';
  const toolCalls: { id: string; index: number; function: { name: string; arguments: string } }[] = [];
  let indexCounter = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('event:')) { currentEvent = trimmed.slice(6).trim(); continue; }
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        const type = obj.type || currentEvent;
        if (type === 'content_block_start') {
          const cb = obj.content_block || {};
          if (cb.type === 'tool_use') {
            toolCalls.push({ id: cb.id || '', index: indexCounter++, function: { name: cb.name || '', arguments: '' } });
          }
        } else if (type === 'content_block_delta') {
          const d = obj.delta || {};
          if (d.type === 'text_delta' && d.text) yield { type: 'content', content: d.text };
          if (d.type === 'input_json_delta' && d.partial_json) {
            const cur = toolCalls[toolCalls.length - 1];
            if (cur) cur.function.arguments += d.partial_json;
          }
        }
        // other events (message_start, message_delta, message_stop, thinking deltas, etc.) ignored
      } catch {
        // ignore malformed chunk
      }
    }
  }
  if (toolCalls.length) yield { type: 'tool_calls', toolCalls };
  yield { type: 'done' };
};

// ---------- provider factory ----------

export const makeCustomProvider = (cfg: CustomProviderConfig): ChatProvider => {
  const base = normalizeBase(cfg.baseUrl, cfg.type);
  const label = cfg.label || cfg.type;

  const listModels = async (_key: string, signal?: AbortSignal): Promise<ModelInfo[]> => {
    const url = buildEndpoint(cfg, 'models');
    const headers = cfg.type === 'anthropic'
      ? anthropicHeaders(cfg.apiKey)
      : { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' };
    let r: Response;
    try {
      r = await fetch(url, { headers, signal });
    } catch (e: any) {
      // Proxy unreachable (e.g. dev without netlify dev) → retry direct.
      if (url.startsWith(PROXY_PATH)) r = await fetch(buildEndpoint({ ...cfg, useProxy: false }, 'models'), { headers, signal });
      else throw new ProviderError(`${label} /models network error: ${e?.message || 'Failed to fetch'}`, undefined, undefined);
    }
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new ProviderError(`${label} /models ${r.status}${d?.error?.message || d?.error ? `: ${d?.error?.message || d?.error}` : ''}`, r.status, d ? JSON.stringify(d) : undefined);
    if (d?.error) throw new ProviderError(`${label} /models returned error: ${d.error?.message || JSON.stringify(d.error)}`, r.status, JSON.stringify(d));
    // Accept OpenAI {data:[...]}, raw array, or some proxies' {models:[...]} shape.
    const arr = (Array.isArray(d) ? d : (d?.data || d?.models || [])) as any[];
    return arr
      .map((m: any) => ({
        id: typeof m === 'string' ? m : (m.id || m.name || ''),
        name: typeof m === 'string' ? m : m.name || m.id,
        provider: cfg.id,
        contextLength: m.context_window || m.max_context_length || m.context_length || (m.limits && (m.limits.max_input_context || m.limits.context_window)),
        isFree: true,
        raw: m
      }))
      .filter(m => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  };

  const testKey = async (_key: string, signal?: AbortSignal): Promise<{ ok: boolean; latencyMs?: number; error?: string }> => {
    const t0 = performance.now();
    if (!cfg.baseUrl.trim()) return { ok: false, error: 'No base URL supplied' };
    if (cfg.type === 'anthropic' && !cfg.apiKey.trim()) return { ok: false, error: 'No API key supplied' };
    try {
      await listModels(cfg.apiKey, signal);
      return { ok: true, latencyMs: Math.round(performance.now() - t0) };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Network error', latencyMs: Math.round(performance.now() - t0) };
    }
  };

  const chatStream = (req: ChatRequest, _key: string, signal: AbortSignal): AsyncIterable<ChatChunk> => {
    const endpoint = buildEndpoint(cfg, 'chat/completions');
    if (cfg.type === 'anthropic') return anthropicChatStream(base, req, cfg.apiKey, signal, label, endpoint);
    return openAiCompatChatStream(base, req, cfg.apiKey, signal, label, endpoint);
  };

  return { id: cfg.id, listModels, testKey, chatStream };
};