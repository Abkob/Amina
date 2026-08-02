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

## Operational limits

Vercel Functions have a request/response body limit, so large files must use the direct Blob flow. Scheduled maintenance is configured once daily so it works on Vercel Hobby; higher tiers can increase the cron frequency. Local filesystem backups and Obsidian sync remain local-only. Continue taking managed PostgreSQL backups through the database provider.
