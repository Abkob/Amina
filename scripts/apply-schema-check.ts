// One-off verification: apply schema.sql to the DB in DATABASE_URL and report.
// Usage: DATABASE_URL=... npx tsx scripts/apply-schema-check.ts
import { initSchema, query, pool } from '../server/db.js';

try {
  await initSchema();
  const m = await query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations');
  const t = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'",
  );
  const chat = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('chat_sessions','chat_messages','schema_migrations')",
  );
  const tz = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='user_schedule_prefs' AND column_name='timezone'",
  );
  console.log(JSON.stringify({
    ok: true,
    migrations_recorded: m.rows[0].n,
    tables: t.rows[0].n,
    chat_and_registry_tables: chat.rows[0].n,
    timezone_column: tz.rows[0].n === 1,
  }));
} catch (err) {
  console.error('SCHEMA APPLY FAILED:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
