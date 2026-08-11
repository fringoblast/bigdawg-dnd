import type { ChatChunk, ChatProvider, ModelInfo } from './types';
import { ProviderError } from './shared';

const BASE_URL = 'https://api.groq.com/openai/v1';

function authHeaders(key: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

const CHAT_MODEL_DENYLIST = /whisper|playai-tts|distil-|embed|image|vision|guard|safety/i;

export const groqProvider: ChatProvider = {
  id: 'groq',

  async listModels(key, signal) {
    const r = await fetch(`${BASE_URL}/models`, { headers: authHeaders(key), signal });
    if (!r.ok) throw new ProviderError(`Groq /models ${r.status}`, r.status);
    const d = await r.json();
    const arr = (d.data || []) as any[];
    return arr
      .filter((m: any) => !CHAT_MODEL_DENYLIST.test(m.id || ''))
      .map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: 'groq',
        contextLength: m.context_window,
        isFree: true,
        raw: m
      }));
  },

  async testKey(key, signal) {
    const t0 = performance.now();
    try {
      const r = await fetch(`${BASE_URL}/models`, { headers: authHeaders(key), signal });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, latencyMs: Math.round(performance.now() - t0) };
      return { ok: true, latencyMs: Math.round(performance.now() - t0) };
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
      yield { type: 'error', error: { status: r.status, message: `Groq ${r.status}`, body: text } };
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
          // ignore
        }
      }
    }
    if (toolCalls.length) {
      yield { type: 'tool_calls', toolCalls };
    }
    yield { type: 'done' };
  }
};
