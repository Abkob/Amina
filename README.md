# Amina

Amina is a private React/Vite workspace backed by an Express API and PostgreSQL. It can run locally as a long-lived server or on Vercel as a Vite frontend plus one serverless Express function.

## Safety model

- Vercel never starts the local listener, seeds data, or applies schema automatically.
- Production API routes require the personal-app password session.
- Uploads go directly from the browser to a private Vercel Blob store; the function only authorizes and registers them.
- Database schema deployment and file migration are explicit, confirmation-gated commands.
- `npm run db:check` is read-only and reports table counts, orphan relationships, extensions, and missing local files.
- Local dumps, environment files, uploads, vault files, and temporary data are excluded from Git and Vercel builds.

## Local development

Requirements: Node.js 24, PostgreSQL with `pgcrypto` and `pgvector`, and a copied `.env` based on `.env.example`.

```powershell
npm install
$env:CONFIRM_SCHEMA_APPLY = '1'
npm run db:deploy
Remove-Item Env:CONFIRM_SCHEMA_APPLY
npm run dev
```

Run the non-mutating and unit/build checks:

```powershell
npm run db:check
npm run check
```

Integration tests require a separate database whose name contains `test`; the guard refuses to use any other database.

```powershell
$env:DATABASE_URL_TEST = 'postgresql://user:password@localhost:5433/amina_test'
npm run test:integration
```

## Complete database + file backups

Open **Settings → Complete disaster backup → Download everything**. A successful
`.amina-backup.zip` contains:

- `database/schema.sql` and JSONL for every row in every public application table;
- every Resource upload and task-note attachment referenced by the database;
- a manifest with table/file counts and SHA-256 checksums;
- portable `backup://` file references instead of machine-specific paths or private Blob URLs.

The database rows come from one PostgreSQL `REPEATABLE READ, READ ONLY` snapshot.
The operation fails instead of silently completing if a referenced file is missing
or changes while being read. Environment variables, database passwords, API keys,
and Blob tokens are never written into the archive.

On Vercel, the archive is streamed into the connected private Blob store and the
browser receives a ten-minute signed download link. This avoids Vercel's function
response-size limit. The private server copy remains listed in Settings until you
explicitly delete it. Locally, the ZIP is written atomically under `backups/`.

Always verify a downloaded copy before relying on it:

```powershell
npm run backup:verify -- "C:\path\to\amina-complete-....amina-backup.zip"
```

The equivalent local command (it creates and immediately verifies the ZIP) is:

```powershell
npm run backup:create
```

The verifier is read-only. It checks every entry checksum, byte count, JSONL row
count, archive path, and manifest total.

### Restore a complete backup

Restore into a new, empty PostgreSQL database first. The command verifies the full
archive before it connects to the target, restores in one transaction, rebuilds
foreign keys, and compares every final table count before committing.

For a local restore (files are copied to a new directory under `server/uploads/`):

```powershell
$env:TARGET_DATABASE_URL = 'postgresql://user:password@host/new_empty_database?sslmode=require'
$env:CONFIRM_PORTABLE_RESTORE = '1'
npm run backup:restore -- "C:\path\to\amina-complete-....amina-backup.zip"
Remove-Item Env:CONFIRM_PORTABLE_RESTORE
```

For a Vercel restore into a new private Blob store, also set:

```powershell
$env:RESTORE_STORAGE = 'blob'
$env:BLOB_READ_WRITE_TOKEN = 'new-private-blob-token'
```

The restore refuses a non-empty target unless `CONFIRM_REPLACE_TARGET=1` is set,
and refuses to target the configured source database unless
`ALLOW_RESTORE_OVER_SOURCE=1` is explicitly set. Prefer a fresh database; inspect
and test it before changing the deployed `DATABASE_URL`.

## Safe Vercel deployment

### 1. Preserve and inventory the source database

Run this on the machine that still has the local database and uploads. Keep the dump outside Git.

```powershell
npm run db:check
pg_dump --format=custom --no-owner --no-acl --dbname="$env:DATABASE_URL" --file="backups/amina-before-vercel.dump"
pg_restore --list "backups/amina-before-vercel.dump" | Select-Object -First 20
```

Save the `db:check` JSON so source and target counts can be compared.

### 2. Restore into fresh managed PostgreSQL

Create a new, empty managed PostgreSQL database that supports both `pgcrypto` and `pgvector`. Restore into the empty target without `--clean`:

```powershell
$env:TARGET_DATABASE_URL = 'postgresql://user:password@managed-host/database?sslmode=require'
pg_restore --no-owner --no-acl --dbname="$env:TARGET_DATABASE_URL" "backups/amina-before-vercel.dump"
$env:DATABASE_URL = $env:TARGET_DATABASE_URL
npm run db:check
```

If deploying to an empty database without restoring a dump, apply the schema explicitly. This never seeds example data:

```powershell
$env:CONFIRM_SCHEMA_APPLY = '1'
npm run db:deploy
Remove-Item Env:CONFIRM_SCHEMA_APPLY
```

### 3. Move uploaded files to private Blob storage

In Vercel, create a private Blob store and copy its `BLOB_READ_WRITE_TOKEN`. Keep the original local upload files until the deployment is fully verified.

First run the migration in dry-run mode against the restored target database:

```powershell
$env:DATABASE_URL = $env:TARGET_DATABASE_URL
$env:BLOB_READ_WRITE_TOKEN = 'your-private-blob-token'
npm run storage:migrate
```

If there are no missing files and the target URL is correct, apply it:

```powershell
$env:CONFIRM_STORAGE_MIGRATION = '1'
npm run storage:migrate
Remove-Item Env:CONFIRM_STORAGE_MIGRATION
npm run db:check
```

The command uploads copies and updates only the target database. It does not delete the original local files.

### 4. Configure the Vercel project

Import the GitHub repository and deploy the safety branch as a preview first. Set these variables for Preview and Production:

- `DATABASE_URL`, `DATABASE_POOL_MAX=3`
- `APP_URL` (use the current preview URL during preview testing)
- `AMINA_ACCESS_PASSWORD`, `AMINA_SESSION_SECRET`
- Optional Google sync: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`,
  `GOOGLE_OAUTH_STATE_SECRET`
- `CRON_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `PROVIDER_MODE=hybrid`, `GEMINI_API_KEY`, `AMINA_MAIN_MODEL`
- `AMINA_EMBEDDING_MODEL`, `AMINA_EMBEDDING_DIMENSION`
- `ALLOW_CLOUD_RAW_TEXT=false`
- `AMINA_AUTO_BACKUP=false`, `OBSIDIAN_VAULT_SYNC=false`

Generate secrets instead of reusing passwords:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Validate a downloaded production-like `.env` locally without printing its values:

```powershell
npm run vercel:preflight:env
```

### 5. Verify the preview before promoting it

Perform these checks in order:

1. Open `/api/health/live`; it should report `status: ok` without touching the database.
2. Open the app and confirm the password gate appears, rejects a wrong password, and accepts the configured password.
3. After login, open `/api/health/ready` and confirm the database is connected and the cloud model is available.
4. Run `npm run db:check` against the managed database and compare every table count with the saved source report.
5. Create, edit, and delete one clearly named temporary task.
6. Upload, open, and delete one disposable PDF or image; confirm the Blob store is private.
7. Invoke `/api/cron/maintenance` with `Authorization: Bearer <CRON_SECRET>` and confirm an `ok` response.
8. Re-run `npm run db:check`; only the deliberate temporary-test changes should differ, and they should be removed.
9. Promote the verified preview to Production and change `APP_URL` to the production URL.

Do not run `npm run migrate` for Vercel; that command is only for the old SQLite-to-PostgreSQL migration.

### Google Tasks + Calendar sync

The Settings page can connect one Google account. Amina creates one Google
Tasks list per active goal, an `Amina · One-offs` list, and a dedicated
`Amina Schedule` secondary calendar. The first sync always shows a count
preview and requires explicit confirmation. Google deletions never delete
Amina rows automatically; simultaneous edits are recorded as conflicts.

In Google Cloud, enable the Google Tasks API and Google Calendar API, then
create an OAuth 2.0 Web application with this redirect URI:

```text
https://your-project.vercel.app/api/google/oauth/callback
```

Use the least-privilege Tasks scope and `calendar.app.created`; Amina can only
manage the secondary calendar it creates. Google Tasks does not provide push
notifications, so the open app polls every two minutes and syncs immediately
after Amina edits. Portable Amina backups intentionally omit Google OAuth
tokens and remote mapping IDs; reconnect Google after a restore.

## Operational limits

Vercel Functions have a request/response body limit, so large files use direct Blob flows and complete backups are assembled in private Blob storage before download. Scheduled maintenance is configured once daily so it works on Vercel Hobby; higher tiers can increase the cron frequency. Local pg_dump rotation and Obsidian sync remain local-only. Continue taking managed PostgreSQL backups through the database provider as a second, independent recovery layer.
