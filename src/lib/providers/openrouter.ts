import type {
  ChatChunk,
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatTool,
  ModelInfo
} from './types';
import { ProviderError } from './shared';

const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://bigdawg-dnd.app';
const APP_TITLE = 'BigDawg D&D';
const BASE_URL = 'https://openrouter.ai/api/v1';

function authHeaders(key: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${key}`,
    'HTTP-Referer': APP_URL,
    'X-Title': APP_TITLE,
    'Content-Type': 'application/json'
  };
}

export const openrouterProvider: ChatProvider = {
  id: 'openrouter',

  async listModels(key, signal) {
    const r = await fetch(`${BASE_URL}/models`, { headers: authHeaders(key), signal });
    if (!r.ok) throw new ProviderError(`OpenRouter /models ${r.status}`, r.status);
    const d = await r.json();
    const arr = (d.data || []) as any[];
    return arr.map(m => ({
      id: m.id,
      name: m.name || m.id,
      provider: typeof m.id === 'string' ? m.id.split('/')[0] : undefined,
      contextLength: m.context_length,
      isFree: !!m.top_provider?.is_free || m.id?.includes(':free'),
      raw: m
    }));
  },

  async testKey(key, signal) {
    const t0 = performance.now();
    try {
      const r = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${key}` },
        signal
      });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      const d = await r.json();
      return { ok: !!d?.data, latencyMs: Math.round(performance.now() - t0) };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Network error' };
    }
  },

  async *chatStream(req, key, signal): AsyncIterable<ChatChunk> {
    let r: Response;
    try {
      r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(key),
        body: JSON.stringify({ ...req, stream: true }),
        signal
      });
    } catch (e: any) {
      yield { type: 'error', error: { message: e?.message || 'Network error' } };
      return;
    }
    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => '');
      yield { type: 'error', error: { status: r.status, message: `OpenRouter ${r.status}`, body: text } };
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
          if (delta?.content) {
            yield { type: 'content', content: delta.content };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let bucket = toolCalls.find(t => t.index === idx);
              if (!bucket) {
                bucket = { id: tc.id || '', index: idx, function: { name: '', arguments: '' } };
                toolCalls.push(bucket);
              }
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
    if (toolCalls.length) {
      yield { type: 'tool_calls', toolCalls };
    }
    yield { type: 'done' };
  }
};
