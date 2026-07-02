import { Ollama } from 'ollama';
import { CHAT_HOST, CHAT_MODEL_PRIMARY, CHAT_MODEL_FALLBACK } from './config/providers.js';

export const CHAT_MODEL = CHAT_MODEL_PRIMARY;
export const FALLBACK_MODEL = CHAT_MODEL_FALLBACK;

export const ollama = new Ollama({ host: CHAT_HOST });

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; max_tokens?: number } = {},
): Promise<string> {
  try {
    const response = await ollama.chat({
      model: CHAT_MODEL,
      messages,
      options: {
        temperature: opts.temperature ?? 0.3,
        num_predict: opts.max_tokens ?? 8192,
      },
    });
    return response.message.content;
  } catch (primaryErr) {
    if (FALLBACK_MODEL && FALLBACK_MODEL !== CHAT_MODEL) {
      console.warn(`[ollama] Primary model ${CHAT_MODEL} failed (${(primaryErr as Error).message}), trying fallback ${FALLBACK_MODEL}`);
      const response = await ollama.chat({
        model: FALLBACK_MODEL,
        messages,
        options: {
          temperature: opts.temperature ?? 0.3,
          num_predict: opts.max_tokens ?? 8192,
        },
      });
      return response.message.content;
    }
    throw primaryErr;
  }
}

// Parse Ollama response as JSON. Ollama models sometimes wrap in ```json fences.
export function parseJSON<T = Record<string, unknown>>(raw: string): T {
  const clean = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`Could not parse JSON from model response: ${raw.slice(0, 200)}`);
  }
}

// Health check — returns true if Ollama is reachable and both models are available.
export async function ollamaHealth(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const list = await ollama.list();
    const models = list.models.map(m => m.name);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: String(err) };
  }
}
