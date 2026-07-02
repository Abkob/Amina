/**
 * Integration test setup. Requires DATABASE_URL_TEST to point at a database
 * whose name contains "test". The server/db.ts guard enforces this at runtime.
 *
 * Usage:
 *   DATABASE_URL_TEST=postgresql://postgres:pgadmin@localhost:5433/marina_test \
 *   npx vitest run --config vitest.integration.config.ts
 */

import { beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import express from 'express';

// Ensure we're in test mode so db.ts uses DATABASE_URL_TEST
process.env.NODE_ENV = 'test';

let server: Server | null = null;
export let baseUrl = '';

export const SKIP_INTEGRATION = !process.env.DATABASE_URL_TEST;

/**
 * Start a minimal express app for integration tests.
 * Only call this in suites that need a running server.
 */
export async function startTestServer(): Promise<void> {
  if (SKIP_INTEGRATION) return;

  const app = express();
  app.use(express.json());

  // Dynamically import routes so the DB guard runs after env is set
  const [
    { goalsRouter },
    { tasksRouter },
    { resourcesRouter },
    { journalRouter },
  ] = await Promise.all([
    import('../routes/goals.js'),
    import('../routes/tasks.js'),
    import('../routes/resources.js'),
    import('../routes/journal.js'),
  ]);

  app.use('/api/goals', goalsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/resources', resourcesRouter);
  app.use('/api/journal', journalRouter);

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
