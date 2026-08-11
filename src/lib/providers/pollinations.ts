import type { ChatChunk, ChatProvider, ChatRequest, ModelInfo } from './types';
import { ProviderError } from './shared';

const BASE_URL = 'https://text.pollinations.ai/openai';
const CHUNK_DELAY_MS = 22;

// Curated list of Pollinations text models that play nicely with general chat.
// Pollinations occasionally rotates these — we keep the list conservative.
const POLLINATIONS_MODELS = [
  { id: 'openai-fast', name: 'openai-fast', notes: 'fastest, decent quality' },
  { id: 'openai', name: 'openai', notes: 'higher quality, slightly slower' },
  { id: 'mistral', name: 'mistral', notes: 'Mistral model, balanced' },
  { id: 'llama', name: 'llama', notes: 'Llama-class model' },
  { id: 'qwen-coder', name: 'qwen-coder', notes: 'good for code & structured output' },
  { id: 'deepseek-r1', name: 'deepseek-r1', notes: 'reasoning model — slower, more thoughtful' }
];

export const pollinationsProvider: ChatProvider = {
  id: 'pollinations',

  async listModels(_key, _signal) {
    return POLLINATIONS_MODELS.map(m => ({
      id: m.id,
      name: m.id,
      provider: 'pollinations',
      contextLength: 8192,
      isFree: true,
      raw: m
    }));
  },

  async testKey(_key, _signal) {
    // No key required. Always passes.
    const t0 = performance.now();
    return { ok: true, latencyMs: Math.round(performance.now() - t0) };
  },

  async *chatStream(req: ChatRequest, _key: string, signal: AbortSignal): AsyncIterable<ChatChunk> {
    // Kick the typing indicator with a single space so it doesn't look frozen
    // while Pollinations actually answers. The real content arrives below.
    yield { type: 'content', content: ' ' };
    let responseText = '';
    try {
      const r = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pollinations API doesn't require auth; ignore the key entirely.
        body: JSON.stringify({
          model: req.model || 'openai-fast',
          messages: req.messages,
          // Note: we deliberately request non-stream — Pollinations' stream is unreliable and
          // we fake a typing feel client-side by chunking the response below.
          stream: false
        }),
        signal
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        yield { type: 'error', error: { status: r.status, message: `Pollinations ${r.status}`, body: text } };
        return;
      }
      const data = await r.json();
      responseText =
        data?.choices?.[0]?.message?.content ||
        data?.content?.[0]?.text ||
        data?.response ||
        data?.output_text ||
        '';
      if (!responseText) {
        yield { type: 'error', error: { message: 'Empty response from Pollinations. Try a different model.' } };
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      yield { type: 'error', error: { message: e?.message || 'Network error' } };
      return;
    }

    // Word-preserving split so spaces/punctuation stay attached to the token before them.
    const tokens = responseText.match(/\S+\s*|\s+/g) || [responseText];
    for (const tok of tokens) {
      if (signal.aborted) return;
      yield { type: 'content', content: tok };
      if (tok.trim().length > 0) {
        await new Promise(res => setTimeout(res, CHUNK_DELAY_MS));
      }
    }
    yield { type: 'done' };
  }
};
