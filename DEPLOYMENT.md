# Deploy the POS to Vercel and Supabase

The frontend is React/Vite; the API is Express. Deploy them as two Vercel projects from this repository. Supabase provides PostgreSQL. The existing Express login and employee roles remain in use; Supabase Auth is not required.

Local MySQL still works when `DATABASE_URL` is unset. No migration runs during application startup or a Vercel build.

## 1. Create the Supabase database

Create an empty Supabase project and open **Connect**. Copy both connection strings:

- **Session pooler, port 5432** (or direct connection): for the one-time migration from your computer.
- **Transaction pooler, port 6543**: for the Vercel API.

Use TLS verification (`?sslmode=verify-full`); URL-encode special characters in the database password. If your connection requires the project's CA certificate, set `DB_SSL_CA` to its PEM contents, both locally and in Vercel. Literal `\n` line separators are supported. Never disable certificate verification. See [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).

In `POS-backend/.env`, keep the existing MySQL `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Add `SUPABASE_MIGRATION_URL` with the session-pooler URL and `APP_TIMEZONE=Asia/Beirut` (or your store's timezone). Keep `DATABASE_URL` unset until the copy is complete.

From `POS-backend`:

```powershell
npm ci
npm run migrate:supabase -- --check
```

The check only reads table counts and checks that the target has no POS tables. Before the final copy, back up MySQL and pause writes from the POS and Telegram bot so no orders arrive after the snapshot starts. Confirm the source database's calendar/timezone matches `APP_TIMEZONE`; timestamps are copied as the source's local date/time strings.

```powershell
npm run migrate:supabase -- --copy
```

This creates all 20 tables, copies rows in foreign-key order, preserves password hashes/IDs/JSON/date strings, verifies row counts, and resets identity sequences. It copies from a read-only MySQL snapshot and commits PostgreSQL only after the entire copy succeeds. Existing POS tables in the target cause it to stop; it never drops or overwrites them. Unknown or missing source tables/columns also require review. Stock expiration triggers and salary timestamps are recreated in PostgreSQL.

For an empty installation with no data to copy, use `--schema-only` instead. Then run `npm run create:admin` with `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` set locally, and `DATABASE_URL` set to the new PostgreSQL database. Do not put those bootstrap variables in Vercel. A copied installation already has its existing login accounts.

The schema enables row-level security and removes browser-role table access. All access goes through the authenticated Express API using the server-only PostgreSQL connection. Do not add public read/write policies for these tables.

## 2. Deploy the API on Vercel

Import this repository as a Vercel project with **Root Directory `POS-backend`** and **Node.js 24.x**. The included `vercel.json` explicitly selects `server.js`, avoiding the old sample `index.js`. No database migration/build command is needed.

Set these production environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction-pooler URL with TLS verification |
| `JWT_TOKEN` | A long, random secret |
| `CLIENT_URL` | Exact frontend origin, e.g. `https://your-pos.vercel.app` |
| `BOT_API_SECRET` | A random secret shared with the Telegram bot |
| `APP_TIMEZONE` | `Asia/Beirut`, or the store's timezone |
| `DB_POOL_SIZE` | `3` initially |
| `NODE_ENV` | `production` |

Use the backend project's production hostname in the next step. Its API must be reachable by the frontend proxy and bot; Vercel deployment protection must not intercept those production requests. Express still enforces login and bot authentication. See [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

## 3. Deploy the frontend on Vercel

Replace `https://YOUR-POS-BACKEND.vercel.app` in `POS-frontend/vercel.json` with the deployed API's production origin. Preserve `/api/:path*` at the end of the destination.

Import the same repository as another project with **Root Directory `POS-frontend`**, **Framework Vite**, **Build `npm run build`**, **Output `dist`**, and **Node.js 24.x**.

Leave `VITE_API_URL` unset in production. The `/api` rewrite forwards API calls through the frontend origin, allowing the existing HttpOnly, secure, SameSite=Lax login cookie to work. Setting it to an unrelated backend domain can prevent browsers from sending that cookie. No Supabase keys, database passwords, or JWT secrets belong in `VITE_*` variables.

The root URL redirects to `/POS/login`; other application paths fall back to `index.html`, so opening or refreshing `/POS/stock` works. Set the API's `CLIENT_URL` to this frontend origin and redeploy after changing environment variables. See [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

Use a separate Supabase project/database and matching API deployment for previews that should not modify production data.

## 4. Telegram bot

The bot remains a separate, continuously running Node process. It can run on the existing computer or a host that supports background workers. Set its `POS_API_URL` to the Vercel backend origin and give it the same `BOT_API_SECRET` as the API. Its polling, in-memory conversations, and local receipt files are not suitable for a Vercel Function. Converting it to webhook delivery with persistent conversation state would be a separate change; Supabase is not hosting this bot process.

The example environment file now contains placeholders. Replace any previously used credentials that appeared in that file before publishing the repository. Keep real `.env` files out of Git; `.gitignore` does not remove files already tracked by Git.

Images are fetched individually from authenticated API routes rather than bundled into history/approval lists. Requests are capped at 4 MB to stay below Vercel's 4.5 MB limit, and the bot selects an appropriately sized photo. Existing individual evidence images over 4 MB must be resized before they can be served. See [Vercel Function limits](https://vercel.com/docs/functions/limitations).

## 5. Verify before switching users

```powershell
# POS-backend
npm test
npm run test:postgres

# POS-frontend
npm run build
```

The PostgreSQL tests run a real PostgreSQL engine locally through PGlite with synthetic data; they do not connect to Supabase or read production records. `npm run test:integration` is the legacy MySQL suite and creates/removes a separate temporary MySQL database. Leave `DATABASE_URL` unset for that suite. Legacy MySQL upgrade/repair scripts are not Supabase migrations.

After deployment, check login/logout and session persistence, refresh an inner URL, open stock and payroll, create a test order, and submit/review a bot request. Confirm the migrated table counts and balances before resuming normal sales. Retain the old MySQL database as a backup; once new sales are recorded on Supabase, switching back requires reconciling those new records.


## Business expenses upgrade

For an existing Supabase deployment, run `npm run migrate:expenses -- --supabase` from `POS-backend`. This explicitly uses `SUPABASE_MIGRATION_URL` (falling back to `DATABASE_URL`). Use the connection for the same Supabase project as the Vercel backend. Without `--supabase`, a local environment with no `DATABASE_URL` migrates MySQL only, even when `SUPABASE_MIGRATION_URL` is present.

Before deploying the Expenses page to an existing database, run `npm run migrate:expenses` from `POS-backend` with the intended database environment configured. This additive, repeatable migration creates only `business_expenses` and its index. It does not run during startup or deployment. PostgreSQL uses `DATABASE_URL`; without it, the migration uses the local MySQL settings. For Supabase, you may instead run `POS-backend/config/expenses-postgres.sql` in the SQL editor. New Supabase installations already include this table in `supabase-schema.sql`.

Expenses are entered by administrators in desktop Expenses and are view-only on mobile. Amounts are stored in USD using the existing currency conversion. Monthly totals use the expense date. Bills may repeat weekly, monthly, or yearly, with an optional inclusive end date. Occurrences are expanded deterministically from the saved schedule, without cron jobs or duplicate database writes. Stopping a schedule excludes occurrences on or after the chosen date and cannot rewrite past bills. Repeating schedules cannot be edited/deleted; stop future repeats and create a replacement bill to change its amount. Furniture/equipment purchases are tracked as spending and are included in Sales business expenses and result after expenses, separately from product gross profit.


### Checkout cost snapshots and repeating expenses upgrade

Run `npm run migrate:expenses -- --supabase` again against the deployed database before deploying this update. The idempotent migration also creates `expense_recurrences`; existing expense records are preserved. Local MySQL uses `npm run migrate:expenses` without `--supabase`.

New checkout records save server-calculated `unit_cost`, `total_cost`, `cost_source` and an order-level cost snapshot in the existing order details JSON, in the same transaction as inventory deduction. Client-supplied costs are overwritten. A missing recipe is explicitly saved as zero cost with `no_recipe` and flagged in Sales. Historical orders without snapshots remain unknown; no current-price backfill is applied. Period cost/profit totals are unavailable if historical costs are missing. Revenue and business expenses remain visible. Expenses affect financial charts and CSV totals on their bill dates; they are not allocated to product profit rankings. Result after expenses excludes payroll and costs not entered in Expenses. Future repeating bills are planned expenses, not payment confirmations.
