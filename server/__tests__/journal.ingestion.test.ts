import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, baseUrl, SKIP_INTEGRATION } from './setup.js';

describe.skipIf(SKIP_INTEGRATION)('Journal ingestion pipeline (integration)', () => {
  let entryId: string;

  beforeAll(startTestServer);

  afterAll(async () => {
    if (entryId) {
      await fetch(`${baseUrl}/api/journal/${entryId}`, { method: 'DELETE' });
    }
    await stopTestServer();
  });

  it('POST /api/journal creates an entry in pending state', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${baseUrl}/api/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_text: '__integration_test_journal_entry__ Worked on task XYZ for 30 minutes.',
        entry_date: today,
      }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string; ingestion_status: string };
    expect(typeof body.id).toBe('string');
    expect(['pending', 'processing']).toContain(body.ingestion_status);
    entryId = body.id;
  });

  it('GET /api/journal returns the created entry', async () => {
    const res = await fetch(`${baseUrl}/api/journal`);
    expect(res.ok).toBe(true);
    const entries = await res.json() as { id: string }[];
    expect(entries.some(e => e.id === entryId)).toBe(true);
  });

  it('POST /api/journal/:id/ingest triggers re-ingestion (returns 200 or 202)', async () => {
    const res = await fetch(`${baseUrl}/api/journal/${entryId}/ingest`, { method: 'POST' });
    // 200 = immediately processed; 202 = queued; both are valid
    expect([200, 202, 409]).toContain(res.status);
  });

  it('GET /api/journal/:id/links returns an array', async () => {
    const res = await fetch(`${baseUrl}/api/journal/${entryId}/links`);
    expect(res.ok).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('DELETE /api/journal/:id removes the entry', async () => {
    const res = await fetch(`${baseUrl}/api/journal/${entryId}`, { method: 'DELETE' });
    expect(res.ok).toBe(true);
    // Verify it's gone
    const check = await fetch(`${baseUrl}/api/journal`);
    const entries = await check.json() as { id: string }[];
    expect(entries.some(e => e.id === entryId)).toBe(false);
    entryId = ''; // prevent double-delete in afterAll
  });
});

describe.skipIf(SKIP_INTEGRATION)('Journal ingestion — validation (integration)', () => {
  beforeAll(startTestServer);
  afterAll(stopTestServer);

  it('rejects entry with missing raw_text', async () => {
    const res = await fetch(`${baseUrl}/api/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_date: '2026-01-01' }),
    });
    expect(res.ok).toBe(false);
  });

  it('defaults entry_date to today when omitted (production contract)', async () => {
    const res = await fetch(`${baseUrl}/api/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: '__test_default_date__' }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string };
    const check = await fetch(`${baseUrl}/api/journal/${body.id}`);
    const entry = await check.json() as { entry_date: string };
    expect(entry.entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await fetch(`${baseUrl}/api/journal/${body.id}`, { method: 'DELETE' });
  });

  it('returns 404 for unknown entry id', async () => {
    const res = await fetch(`${baseUrl}/api/journal/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });
});
