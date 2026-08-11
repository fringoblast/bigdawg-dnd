export type ProviderId = 'openrouter' | 'groq' | 'cerebras' | 'nim' | 'pollinations' | (string & {});

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
}

export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: ChatTool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
  contextLength?: number;
  isFree?: boolean;
  raw?: unknown;
}

export interface ChatChunk {
  type: 'content' | 'tool_calls' | 'done' | 'error';
  content?: string;
  toolCalls?: { id?: string; index: number; function?: { name?: string; arguments?: string } }[];
  error?: { status?: number; message: string; body?: string };
}

export interface ChatProvider {
  readonly id: ProviderId;
  listModels(apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]>;
  testKey(apiKey: string, signal?: AbortSignal): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  chatStream(req: ChatRequest, apiKey: string, signal: AbortSignal): AsyncIterable<ChatChunk>;
}
