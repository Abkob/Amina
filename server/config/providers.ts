/**
 * Central provider configuration.
 * All modules that need chat model names, embedding model names, or provider
 * mode must import from here — never read process.env directly for these values.
 *
 * Provider modes:
 *   local   — Ollama chat + local embeddings (no cloud requests)
 *   hybrid  — Ollama chat + Gemini embeddings (default; requires GEMINI_API_KEY)
 *   cloud   — cloud chat + cloud embeddings (requires explicit opt-in)
 *
 * The PROVIDER_MODE env var is set at startup and validated here.
 */

export type ProviderMode = 'local' | 'hybrid' | 'cloud';

function resolveMode(): ProviderMode {
  const raw = process.env.PROVIDER_MODE?.toLowerCase();
  if (raw === 'local' || raw === 'hybrid' || raw === 'cloud') return raw;
  // Default: hybrid (Ollama chat + Gemini embeddings) when GEMINI_API_KEY is present
  if (!process.env.GEMINI_API_KEY) return 'local';
  return 'hybrid';
}

export const PROVIDER_MODE: ProviderMode = resolveMode();

// ─── Chat provider ─────────────────────────────────────────────────────────────

export const CHAT_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
export const CHAT_MODEL_PRIMARY = process.env.AMINA_MAIN_MODEL ?? process.env.OLLAMA_MODEL ?? 'glm-5.2:cloud';
export const CHAT_MODEL_FALLBACK = process.env.AMINA_LOCAL_FALLBACK_MODEL ?? 'qwen3.6';

// ─── Embedding provider ────────────────────────────────────────────────────────

export const EMBED_MODEL = process.env.AMINA_EMBEDDING_MODEL ?? 'gemini-embedding-2';
export const EMBED_DIMENSION = 3072;

// When true, raw journal/note/document text may be sent to the embedding provider.
// In hybrid/cloud mode this is Gemini. Default: only summaries are sent to cloud.
export const ALLOW_CLOUD_RAW_TEXT = process.env.ALLOW_CLOUD_RAW_TEXT === 'true';

// ─── Display helpers ──────────────────────────────────────────────────────────

export function getProviderSummary() {
  return {
    mode: PROVIDER_MODE,
    chat: {
      provider: 'ollama',
      model: CHAT_MODEL_PRIMARY,
      fallback: CHAT_MODEL_FALLBACK,
      host: CHAT_HOST,
    },
    embeddings: {
      provider: PROVIDER_MODE === 'local' ? 'local' : 'gemini',
      model: EMBED_MODEL,
      dimension: EMBED_DIMENSION,
      sends_raw_text_to_cloud: PROVIDER_MODE !== 'local' && ALLOW_CLOUD_RAW_TEXT,
    },
  };
}
