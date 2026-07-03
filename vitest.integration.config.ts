import { defineConfig } from 'vitest/config';

/**
 * Integration test config. Requires DATABASE_URL_TEST env var.
 * Run with: DATABASE_URL_TEST=postgresql://...@localhost:5433/marina_test npx vitest run --config vitest.integration.config.ts
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts'],
    testTimeout: 30_000,
    // All files share one test database. Running them in parallel makes
    // concurrent initSchema DDL race and lets suites see each other's rows —
    // serialize for deterministic results.
    fileParallelism: false,
  },
});
