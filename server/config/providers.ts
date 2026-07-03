/**
 * Central provider configuration.
 * All modules that need chat model names, embedding model names, or provider
 * mode must import from here — never read process.env directly for these values.
 *
 * Provider modes:
 *   local   — Ollama chat; embeddings still require Gemini (no local embedding
 *             implementation exists — see getProviderSummary)
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
export const CHAT_MODEL_FALLBACK = process.env.AMINA_LOCAL_FALLBACK_MODEL ?? 'qwen3:8b';

// An Ollama model with the ':cloud' tag executes on Ollama's cloud service —
// prompts leave this machine even though the API endpoint is localhost.
export function isCloudChatModel(model: string): boolean {
  return model.endsWith(':cloud') || model.endsWith('-cloud');
}

// Bounded chat request wait — callers must not hang forever on a wedged model.
export const CHAT_TIMEOUT_MS = Number(process.env.AMINA_CHAT_TIMEOUT_MS ?? 180_000);

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
      // ':cloud' models run on Ollama's cloud — chat prompts leave this machine
      model_is_cloud: isCloudChatModel(CHAT_MODEL_PRIMARY),
      fallback: CHAT_MODEL_FALLBACK,
      fallback_is_cloud: isCloudChatModel(CHAT_MODEL_FALLBACK),
      host: CHAT_HOST,
    },
    embeddings: {
      // There is no local embedding implementation — embeddings always go to
      // Gemini. Reporting 'local' here would be dishonest; the corpus is
      // 3072-dim Gemini vectors and mixing providers would fragment it.
      provider: 'gemini',
      model: EMBED_MODEL,
      dimension: EMBED_DIMENSION,
      requires_api_key: true,
      api_key_present: Boolean(process.env.GEMINI_API_KEY),
      sends_raw_text_to_cloud: ALLOW_CLOUD_RAW_TEXT,
    },
  };
}
