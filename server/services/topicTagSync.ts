import crypto from 'crypto';
import { query } from '../db.js';

/**
 * Choice A: tags ARE topics. Any tag on any record that matches an active
 * topic's name or alias becomes a topic membership:
 *  - a tag the USER typed  → source 'imported', status 'accepted' (their word
 *    is their assertion — full authority, survives everything)
 *  - a tag the AI produced → source 'ai_suggested', status 'suggested' (waits
 *    in the review inbox)
 * Rejected pairs are never resurrected (ON CONFLICT DO NOTHING against the
 * unique (topic, entity) row, which keeps its 'rejected' status).
 */
export async function syncTagsToTopics(
  entityType: 'journal_entry' | 'resource' | 'task' | 'goal' | 'note',
  entityId: string,
  tags: string[],
  authority: 'manual' | 'ai',
): Promise<number> {
  const terms = tags.map(t => t.trim().toLowerCase()).filter(t => t.length >= 2);
  if (!terms.length) return 0;

  const { rows: topicRows } = await query<{ id: string; name: string; alias: string | null }>(
    `SELECT tp.id, tp.name, ta.alias
     FROM topics tp LEFT JOIN topic_aliases ta ON ta.topic_id = tp.id
     WHERE tp.status = 'active'`,
  );
  if (!topicRows.length) return 0;

  const topicByTerm = new Map<string, string>();
  for (const t of topicRows) {
    topicByTerm.set(t.name.toLowerCase(), t.id);
    if (t.alias) topicByTerm.set(t.alias.toLowerCase(), t.id);
  }

  const now = new Date().toISOString();
  const seen = new Set<string>();
  let created = 0;
  for (const term of terms) {
    const topicId = topicByTerm.get(term);
    if (!topicId || seen.has(topicId)) continue;
    seen.add(topicId);
    const { rowCount } = await query(
      `INSERT INTO topic_memberships
         (id, topic_id, entity_type, entity_id, source, status, confidence, evidence_json, reason_codes, decided_at, decided_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'["tag_match"]',$9,$10,$11,$11)
       ON CONFLICT (topic_id, entity_type, entity_id) DO NOTHING`,
      [crypto.randomUUID(), topicId, entityType, entityId,
       authority === 'manual' ? 'imported' : 'ai_suggested',
       authority === 'manual' ? 'accepted' : 'suggested',
       authority === 'manual' ? 1.0 : 0.7,
       JSON.stringify({ tag: term, via: authority === 'manual' ? 'manual_tag' : 'ai_tag' }),
       authority === 'manual' ? now : null,
       authority === 'manual' ? 'user' : null,
       now],
    );
    created += rowCount ?? 0;
  }
  return created;
}

/** Parse a tags_json column defensively. */
export function parseTags(tagsJson: unknown): string[] {
  if (typeof tagsJson !== 'string') return [];
  try {
    const arr = JSON.parse(tagsJson);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Called when a NEW topic is created: existing records already tagged with its
 * name join retroactively (manual tags → accepted, journal AI tags → suggested).
 */
export async function backfillTopicFromTags(topicId: string, topicName: string): Promise<{ accepted: number; suggested: number }> {
  const term = topicName.trim().toLowerCase();
  if (term.length < 2) return { accepted: 0, suggested: 0 };
  const now = new Date().toISOString();
  let accepted = 0;
  let suggested = 0;

  const sources: Array<{ table: string; entityType: string; col: string; authority: 'manual' | 'ai' }> = [
    { table: 'resources',       entityType: 'resource',      col: 'tags_json',    authority: 'manual' },
    { table: 'tasks',           entityType: 'task',          col: 'tags_json',    authority: 'manual' },
    { table: 'journal_entries', entityType: 'journal_entry', col: 'tags_json',    authority: 'manual' },
    { table: 'journal_entries', entityType: 'journal_entry', col: 'ai_tags_json', authority: 'ai' },
  ];

  for (const s of sources) {
    const { rows } = await query<{ id: string; tags: string }>(
      `SELECT id, ${s.col} AS tags FROM ${s.table} WHERE ${s.col} IS NOT NULL AND ${s.col} != '[]'`,
    );
    for (const r of rows) {
      const tags = parseTags(r.tags).map(t => t.trim().toLowerCase());
      if (!tags.includes(term)) continue;
      const { rowCount } = await query(
        `INSERT INTO topic_memberships
           (id, topic_id, entity_type, entity_id, source, status, confidence, evidence_json, reason_codes, decided_at, decided_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'["tag_match"]',$9,$10,$11,$11)
         ON CONFLICT (topic_id, entity_type, entity_id) DO NOTHING`,
        [crypto.randomUUID(), topicId, s.entityType, r.id,
         s.authority === 'manual' ? 'imported' : 'ai_suggested',
         s.authority === 'manual' ? 'accepted' : 'suggested',
         s.authority === 'manual' ? 1.0 : 0.7,
         JSON.stringify({ tag: term, via: s.authority === 'manual' ? 'manual_tag' : 'ai_tag', backfill: true }),
         s.authority === 'manual' ? now : null,
         s.authority === 'manual' ? 'user' : null,
         now],
      );
      if (rowCount) { if (s.authority === 'manual') accepted++; else suggested++; }
    }
  }
  return { accepted, suggested };
}
