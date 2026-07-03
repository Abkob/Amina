/**
 * Integration test setup. Requires DATABASE_URL_TEST to point at a database
 * whose name contains "test". The server/db.ts guard enforces this at runtime.
 *
 * Usage:
 *   DATABASE_URL_TEST=postgresql://postgres:pgadmin@localhost:5433/marina_test \
 *   npx vitest run --config vitest.integration.config.ts
 */

import { createServer, type Server } from 'node:http';

// Ensure we're in test mode so db.ts uses DATABASE_URL_TEST
process.env.NODE_ENV = 'test';

let server: Server | null = null;
export let baseUrl = '';

export const SKIP_INTEGRATION = !process.env.DATABASE_URL_TEST;

let schemaApplied = false;

/**
 * Start the EXACT production Express application (server/app.ts createApp)
 * against the isolated test database. Background workers and listeners from
 * server/index.ts are NOT started — tests drive the HTTP surface only.
 * Real migrations (schema.sql) are applied once per run.
 */
export async function startTestServer(): Promise<void> {
  if (SKIP_INTEGRATION) return;
  if (server) return; // already running — suites may call this from nested hooks

  // Dynamic imports so the DB guard runs after NODE_ENV is set
  const { initSchema } = await import('../db.js');
  const { createApp } = await import('../app.js');

  if (!schemaApplied) {
    await initSchema(); // idempotent — applies schema + versioned migrations
    schemaApplied = true;
  }

  const app = createApp();
  await new Promise<void>(resolve => {
    server = createServer(app).listen(0, '127.0.0.1', resolve);
  });
  const addr = server!.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

export async function stopTestServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server!.close(err => (err ? reject(err) : resolve())),
  );
  server = null;
  baseUrl = '';
}
