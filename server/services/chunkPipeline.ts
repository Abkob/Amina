import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { query } from '../db.js';
import { queueEmbeddingUpsert, queueEmbeddingDelete } from './embeddingLifecycle.js';

const CHUNK_MAX_CHARS = 2000;
const SUPPORTED_TEXT_EXTS = new Set(['.txt', '.md', '.csv']);

// ─── Prompt injection sanitizer ───────────────────────────────────────────────
// Strip patterns that could hijack an LLM when chunk content is later injected
// into a prompt. This is defense-in-depth — do not rely on this alone.
export function sanitizeChunkContent(text: string): string {
  return text
    .replace(/<\|.*?\|>/gs, '')                               // <|im_start|> token boundaries
    .replace(/\[\/?(INST|SYS|SYSTEM)\]/gi, '')               // [INST] / [/INST] instruction tags
    .replace(/###\s*(System|User|Assistant)\s*:/gi, '###')   // ### role markers
    .replace(/^(System|User|Assistant)\s*:\s*/gim, '')        // inline role prefixes
    .trim();
}

// ─── Text extraction ──────────────────────────────────────────────────────────

interface ExtractedText {
  text: string;
  totalPages: number | null;
}

async function extractText(filePath: string, mimeType: string): Promise<ExtractedText | null> {
  const ext = path.extname(filePath).toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse = ((await import('pdf-parse')) as any).default ?? (await import('pdf-parse'));
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return { text: data.text as string, totalPages: (data.numpages as number) ?? null };
    } catch (err) {
      console.error('[chunk-pipeline] PDF parse error:', err);
      return null;
    }
  }

  if (SUPPORTED_TEXT_EXTS.has(ext) || mimeType.startsWith('text/')) {
    const text = await fs.readFile(filePath, 'utf8');
    return { text, totalPages: null };
  }

  return null;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

interface Chunk {
  content: string;
  charStart: number;
  charEnd: number;
}

function splitIntoChunks(text: string): Chunk[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: Chunk[] = [];
  let current = '';
  let currentStart = 0;
  let cursor = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    cursor += para.length + 2; // +2 for the \n\n separator
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= CHUNK_MAX_CHARS) {
      if (!current) currentStart = cursor - para.length - 2;
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else {
      if (current) {
        chunks.push({ content: current.trim(), charStart: currentStart, charEnd: cursor - para.length - 2 });
      }
      if (trimmed.length > CHUNK_MAX_CHARS) {
        const start = cursor - para.length - 2;
        for (let i = 0; i < trimmed.length; i += CHUNK_MAX_CHARS) {
          chunks.push({
            content: trimmed.slice(i, i + CHUNK_MAX_CHARS),
            charStart: start + i,
            charEnd: start + i + CHUNK_MAX_CHARS,
          });
        }
        current = '';
        currentStart = cursor;
      } else {
        current = trimmed;
        currentStart = cursor - para.length - 2;
      }
    }
  }

  if (current.trim()) {
    chunks.push({ content: current.trim(), charStart: currentStart, charEnd: cursor });
  }

  return chunks.filter(c => c.content.length > 20);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processResourceChunks(
  resourceId: string,
  filePath: string,
  mimeType: string,
): Promise<void> {
  const extracted = await extractText(filePath, mimeType);
  if (!extracted) return;

  const rawChunks = splitIntoChunks(extracted.text);
  if (!rawChunks.length) return;

  const totalChars = extracted.text.length || 1;
  const totalPages = extracted.totalPages;
  const now = new Date().toISOString();

  const { rows: existing } = await query(
    'SELECT id, chunk_index, content_hash FROM resource_chunks WHERE resource_id=$1 ORDER BY chunk_index ASC',
    [resourceId],
  ) as { rows: { id: string; chunk_index: number; content_hash: string }[] };

  const existingByIndex = new Map(existing.map(r => [r.chunk_index, r]));

  for (let i = 0; i < rawChunks.length; i++) {
    const raw = rawChunks[i];
    const content = sanitizeChunkContent(raw.content);
    if (!content) continue;

    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const existingChunk = existingByIndex.get(i);
    if (existingChunk?.content_hash === hash) continue;

    const chunkId = existingChunk?.id ?? crypto.randomUUID();

    // Approximate page numbers from character offset
    const pageStart = totalPages
      ? Math.max(1, Math.ceil((raw.charStart / totalChars) * totalPages))
      : null;
    const pageEnd = totalPages
      ? Math.min(totalPages, Math.ceil((raw.charEnd / totalChars) * totalPages))
      : null;

    const metadata = JSON.stringify({
      char_start: raw.charStart,
      char_end: raw.charEnd,
      ...(totalPages ? { approx_page_start: pageStart, approx_page_end: pageEnd, total_pages: totalPages } : {}),
    });

    await query(
      `INSERT INTO resource_chunks
         (id, resource_id, chunk_index, content, content_hash, page_start, page_end, chunk_metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE
         SET content=$4, content_hash=$5, page_start=$6, page_end=$7, chunk_metadata=$8`,
      [chunkId, resourceId, i, content, hash, pageStart, pageEnd, metadata, now],
    );

    await queueEmbeddingUpsert('resource_chunk', resourceId, chunkId);
  }

  // Delete stale chunks beyond new length
  const staleChunks = existing.filter(r => r.chunk_index >= rawChunks.length);
  for (const stale of staleChunks) {
    await query('DELETE FROM resource_chunks WHERE id=$1', [stale.id]);
    await queueEmbeddingDelete('resource_chunk', resourceId, stale.id);
  }
}
