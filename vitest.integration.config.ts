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
  },
});
