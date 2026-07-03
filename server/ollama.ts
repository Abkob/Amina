import { Ollama } from 'ollama';
import {
  CHAT_HOST,
  CHAT_MODEL_PRIMARY,
  CHAT_MODEL_FALLBACK,
  CHAT_TIMEOUT_MS,
  isCloudChatModel,
} from './config/providers.js';

export const CHAT_MODEL = CHAT_MODEL_PRIMARY;
export const FALLBACK_MODEL = CHAT_MODEL_FALLBACK;

export const ollama = new Ollama({ host: CHAT_HOST });

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Model availability ──────────────────────────────────────────────────────

export type ModelStatus = 'available' | 'cloud' | 'missing' | 'unknown';

// Cache the installed-model list briefly so health checks and per-request
// fallback guards don't hammer the Ollama API.
let modelListCache: { names: string[]; fetchedAt: number } | null = null;
const MODEL_LIST_TTL_MS = 60_000;

async function listInstalledModels(): Promise<string[]> {
  if (modelListCache && Date.now() - modelListCache.fetchedAt < MODEL_LIST_TTL_MS) {
    return modelListCache.names;
  }
  const list = await ollama.list();
  const names = list.models.map(m => m.name);
  modelListCache = { names, fetchedAt: Date.now() };
  return names;
}

function classifyModel(model: string, installed: string[]): ModelStatus {
  // Exact match, or match ignoring the ':latest' suffix convention
  if (installed.some(n => n === model || n === `${model}:latest` || `${n}:latest` === model)) {
    return 'available';
  }
  // Cloud models execute remotely; they may not appear in the local list even
  // when usable. Report them distinctly — reachability is only proven by use.
  if (isCloudChatModel(model)) return 'cloud';
  return 'missing';
}

/**
 * Validates the configured chat models against what Ollama actually has.
 * Used by readiness endpoints so a configured-but-missing model is surfaced
 * instead of failing silently at chat time.
 */
export async function validateChatModels(): Promise<{
  reachable: boolean;
  primary: { model: string; status: ModelStatus };
  fallback: { model: string; status: ModelStatus };
  installed: string[];
  error?: string;
}> {
  try {
    const installed = await listInstalledModels();
    return {
      reachable: true,
      primary: { model: CHAT_MODEL, status: classifyModel(CHAT_MODEL, installed) },
      fallback: { model: FALLBACK_MODEL, status: classifyModel(FALLBACK_MODEL, installed) },
      installed,
    };
  } catch (err) {
    return {
      reachable: false,
      primary: { model: CHAT_MODEL, status: 'unknown' },
      fallback: { model: FALLBACK_MODEL, status: 'unknown' },
      installed: [],
      error: String(err),
    };
  }
}

// ─── Chat ────────────────────────────────────────────────────────────────────

class ChatTimeoutError extends Error {
  constructor(model: string, ms: number) {
    super(`Chat request to ${model} timed out after ${ms}ms`);
    this.name = 'ChatTimeoutError';
  }
}

async function chatOnce(
  model: string,
  messages: ChatMessage[],
  opts: { temperature?: number; max_tokens?: number },
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ChatTimeoutError(model, CHAT_TIMEOUT_MS)), CHAT_TIMEOUT_MS);
    timer.unref?.();
  });
  const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
  const startedAt = Date.now();
  try {
    const response = await Promise.race([
      ollama.chat({
        model,
        messages,
        // qwen3 emits long chain-of-thought by default, which multiplies
        // latency and routinely blows the timeout on structured extraction.
        ...(model.startsWith('qwen3') ? { think: false } : {}),
        // Keep the model resident between calls — a cold reload plus prompt
        // evaluation costs minutes on this hardware and blows the timeout.
        keep_alive: process.env.AMINA_KEEP_ALIVE ?? '60m',
        options: {
          temperature: opts.temperature ?? 0.3,
          num_predict: opts.max_tokens ?? 8192,
          // Ollama defaults num_ctx to 4096, silently truncating our prompts:
          // the copilot context budget alone allows ~13K tokens. Truncation
          // made the model return unusable output with no error.
          num_ctx: Number(process.env.AMINA_NUM_CTX ?? 16384),
        },
      }),
      timeout,
    ]);
    console.log(`[ollama] ${model} ok in ${Math.round((Date.now() - startedAt) / 1000)}s (prompt ${promptChars} chars)`);
    return response.message.content;
  } catch (err) {
    console.warn(`[ollama] ${model} failed after ${Math.round((Date.now() - startedAt) / 1000)}s (prompt ${promptChars} chars): ${(err as Error).message}`);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Transient network failures (DNS blips, resets) are worth one bounded retry
// of the primary before engaging the fallback — a cloud model that answers in
// seconds beats a local model that needs minutes for the same prompt.
function isTransientNetworkError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /no such host|dial tcp|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(msg);
}

async function tryPrimary(
  messages: ChatMessage[],
  opts: { temperature?: number; max_tokens?: number },
): Promise<string> {
  try {
    return await chatOnce(CHAT_MODEL, messages, opts);
  } catch (firstErr) {
    if (!isTransientNetworkError(firstErr)) throw firstErr;
    console.warn(`[ollama] Primary ${CHAT_MODEL} hit a transient network error — retrying once before fallback`);
    await new Promise(r => setTimeout(r, 2000));
    return chatOnce(CHAT_MODEL, messages, opts);
  }
}

export async function chat(
  messages: ChatMessage[],
  opts: { temperature?: number; max_tokens?: number } = {},
): Promise<string> {
  try {
    return await tryPrimary(messages, opts);
  } catch (primaryErr) {
    if (FALLBACK_MODEL && FALLBACK_MODEL !== CHAT_MODEL) {
      // Only attempt the fallback when it is actually usable — retrying a
      // missing model would just mask the real failure with a second one.
      let fallbackUsable = true;
      try {
        const installed = await listInstalledModels();
        fallbackUsable = classifyModel(FALLBACK_MODEL, installed) !== 'missing';
      } catch { /* Ollama unreachable — the fallback attempt will surface it */ }

      if (fallbackUsable) {
        console.warn(`[ollama] Primary model ${CHAT_MODEL} failed (${(primaryErr as Error).message}), trying fallback ${FALLBACK_MODEL}`);
        return chatOnce(FALLBACK_MODEL, messages, opts);
      }
      console.error(`[ollama] Primary model ${CHAT_MODEL} failed and configured fallback ${FALLBACK_MODEL} is not installed`);
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
    const models = await listInstalledModels();
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: String(err) };
  }
}
