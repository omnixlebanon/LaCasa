# Deploy the POS to Vercel and Supabase

Product image uploads use **Supabase Storage** on Vercel, with files in the `products/` folder of the public `menu-images` bucket. The backend creates this bucket on the first valid upload, restricted to PNG, JPEG, and WebP files under 3 MB. It stores the direct public CDN URL in the product record so the menu loads images without going through the backend or fetching image bytes from PostgreSQL. Unique filenames and a one-year cache lifetime allow CDN/browser caching without stale replacements. No product-images database migration is needed. Local installations without cloud/storage configuration save files in `POS-backend/images/products`; keep that folder writable, persisted, and backed up. Existing menu images and HTTPS image URLs still display as before. Uploads require a server connection.

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
| `SUPABASE_URL` | Optional for standard Supabase `DATABASE_URL` connections; otherwise the project URL, e.g. `https://your-project-ref.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy `service_role` API key from the same project's Settings → API Keys; backend only |
| `SUPABASE_IMAGE_BUCKET` | Optional; defaults to `menu-images` |
| `JWT_TOKEN` | A long, random secret |
| `CLIENT_URL` | Exact frontend origin, e.g. `https://your-pos.vercel.app` |
| `BOT_API_SECRET` | A random secret shared with the Telegram bot |
| `APP_TIMEZONE` | `Asia/Beirut`, or the store's timezone |
| `DB_POOL_SIZE` | `3` initially |
| `NODE_ENV` | `production` |

Add `SUPABASE_SERVICE_ROLE_KEY` to the **backend** Vercel project's production environment, then redeploy it. The Storage project URL is derived from `DATABASE_URL` for Supabase's direct `db.<project-ref>.supabase.co` connection or pooler connections using the `postgres.<project-ref>` username. For custom hosts or connection formats, set `SUPABASE_URL` explicitly; it takes precedence. Never use `VITE_` prefixes or expose the service-role key in the frontend. Uploads remain restricted to the existing management roles. The bucket allows public image downloads; uploads go through the authenticated backend. No public upload policy or Supabase Auth setup is needed. If a bucket with the configured name already exists, it must be public; the backend will not change a private bucket's visibility. Use a dedicated image bucket rather than one containing private files. See [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

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


### Product and category POS visibility

Before deploying visibility controls, run `npm run migrate:product-visibility -- --supabase` from `POS-backend` for the deployed Supabase database (uses `SUPABASE_MIGRATION_URL`, falling back to `DATABASE_URL`). For local MySQL, omit `--supabase`. This repeatable migration adds `pos_hidden` flags with visible defaults; nothing is deleted.

Admins can hide/show products and categories in Product Management. POS loads `/products?scope=pos` and `/products/categories?scope=pos`; management and sales retain all records. Category hiding takes precedence over product visibility without changing product flags. Reload an already-open POS to refresh visibility. Existing orders are kept and can still be completed; visibility controls the catalog, not historical records or previously added order items.

## Public customer menu

The menu from https://github.com/mSWebsit/LaCasa_Menu (commit `1a9ca225e131851105e9fb51f51c4cb30eaf11ee`) is bundled in `POS-frontend/public/menu/`. Open `/menu` without logging in, or use **Open Menu** in Menu Management. Vite copies these files into the frontend build; Vercel routes `/menu` to its standalone HTML page. The POS stays under `/POS`.

Menu content is fetched from the read-only `/api/public/menu` endpoint. Product Management controls names, prices, descriptions and images. Product/category visibility is shared with the POS. Open menus refresh every 30 seconds and when returning to the tab. Deploy both frontend and backend for synchronization. The database must have the `product_description`, `product_image` and `pos_hidden` columns (included in the catalog import and baseline schema). Preserve the `/menu/` base URL when editing the HTML so images and styles work on direct visits.

## Offline operation and synchronization

Run `npm run migrate:offline -- live` from `POS-backend` **before deploying the backend**, then deploy both backend and frontend. This additive migration uses `SUPABASE_MIGRATION_URL` (or `DATABASE_URL`) and creates the revision, operation receipt, shared-cart and completed-cart tables with browser-role access disabled. Run `npm run migrate:offline -- local` for MySQL. A missing migration causes protected API requests to return 503; migrating only MySQL does not fix the Vercel database.

On each device, sign in while online and open **Sync â†’ Prepare / refresh offline data**. Wait for both downloaded data and app files to be ready. Offline reopening requires a production build served over HTTPS (localhost also works); Vite development mode does not install the service worker. Keep the same browser profile/account. Installing to the home screen is optional. Close other app tabs and reopen after a deployment to activate the new app shell; never clear site data to update an installation with pending work.

POS carts, checkout, occupied tables, catalog/recipe/stock edits, expenses, employee/schedule changes and review decisions save locally first. Open carts are shared after syncing. Pending work is isolated on its device until it reconnects. The app must be open to synchronize; other open devices check for shared changes every 15 seconds. Signing out keeps pending work, but signing in again requires internet. A revoked/expired session pauses syncing until the same account signs in again.

Cart edits and the operation queue commit to encrypted IndexedDB before the UI reports success. Closing/reloading does not clear unfinished carts, including at midnight. Each operation has a stable identity; the backend commits its receipt and business changes in one transaction. A separate checkout identity prevents a shared cart from becoming two sales. Confirmed responses are retained as compact local receipts. The service worker caches only the app shell, not authenticated API responses.

Offline checkouts keep the device's original sale timestamp (Beirut calendar date), quantities and recipe/cost snapshot. The server validates the saved ingredient references and calculates totals from that snapshot. Without an offline snapshot, ordinary API checkouts still calculate costs from the server recipe. Device clocks must be accurate. Figures remain provisional until synchronization, particularly payroll/review decisions and stock validation. The downloaded calendar covers the current year plus December/January buffers; payroll starts with the current month. Visiting other periods online downloads them too. Undownloaded periods report an error instead of showing an empty result. Public customer menus and externally hosted images/evidence still require internet.

Concurrent server edits pause the queue instead of silently replacing shared values. In **Sync**, inspect the saved changes and **View latest shared data**, then review/retry each paused change. **Correct saved fields** is an advanced JSON recovery option for rejected data: it verifies that the server has not applied the operation, preserves the original in the recovery backup, rebuilds the local view, and pauses later changes for review. Do not force a stale table layout or cart over another cashier's changes without checking it.

Use **Export backup** regularly during an outage. Backups include business data and any pending private account fields; keep them private. Restore requires the same account and no existing pending changes/open carts, so it cannot overwrite unsynced work. Browser storage is not a hardware backup: clearing site data, private browsing cleanup, storage eviction or losing the device can destroy unsynced data. Request persistent storage through **Prepare / refresh** and keep an external export.

Validation: `npm run test:offline` and `npm run test:offline:browser` from `POS-frontend` (build first with `VITE_API_URL=/`; in PowerShell, set `$env:VITE_API_URL = '/'` before `npm run build`; the browser test uses only an isolated fixture server and a temporary browser profile). Set `BROWSER_EXE` if Chrome is installed elsewhere. Backend integration tests include duplicate retries, stale revisions, failed transaction rollback, revoked access and shared-cart checkout. On memory-constrained machines use `node --liftoff-only --test --test-concurrency=1 tests/*.test.js`.

### Menu ordering
Before deploying the menu ordering update, run `npm run migrate:menu-order` from POS-backend for the local database and `npm run migrate:menu-order -- --supabase` for the live database. This adds positions without deleting catalog data. Deploy both backend and frontend; menu management saves ordering through the offline sync queue.

### A full day offline
Before going offline, sign in on the device, open Sync, and choose Prepare / refresh offline data. Check that both downloaded data and app files are ready. The panel shows pending sales separately from all saved changes and reports browser storage usage. Request persistent storage using the preparation button and export a backup during an extended outage. Do not clear site data.

Consecutive unsent edits to the same cart are compacted to its latest saved contents. Submitted operations and checkouts are never compacted. Reconnect with the app open to sync; rejected changes are reported and retained in recovery rather than silently treated as successful sales.

Run `npm run test:offline:day` in POS-frontend after building with a same-origin API URL (`VITE_API_URL=/`). It uses isolated Chrome storage and a fixture API, with 100 products, 500 offline orders, 2,500 item edits, table changes, offline reload, and duplicate-sale checks after reconnect. It does not touch production data. Device performance and server/network latency may differ from the test.

### Editable menu groups
Run `npm run migrate:menu-groups` in POS-backend for local MySQL and `npm run migrate:menu-groups -- --supabase` for production before deploying both apps. The migration preserves products/categories and assigns the original menu groups once. Groups and category assignments are included in offline preparation.

### Telegram disabled
Telegram chatbot UI, stock/shift approvals, employee Telegram links, and new Telegram refund requests are disabled. Backend workflow entry points return HTTP 410, and telegram-bot/bot.js exits without polling. Historical business records are retained. Deploy both apps; stop any separately hosted running bot worker as well.

### Stock purchase history
Before deploying stock history, run `npm run migrate:stock-history -- --supabase` from `POS-backend` for Supabase (omit `-- --supabase` for the configured local database). This adds `stock_purchases` without changing existing inventory. Stock batch additions record original quantity, ingredient unit cost, supplier and timestamp transactionally; refunds do not count as purchases. Historical purchases cannot be reconstructed from remaining stock. Deploy the backend before the frontend and reconnect each device to prepare its offline history cache.

### Payroll in sales
Deploy the backend before the frontend to enable `/api/employees/payroll-costs`. No new database migration is needed. Sales includes recorded paid salary amounts on their payment dates, including payments saved offline. Changing a salary rate leaves the recorded cost unchanged until the payment amount is updated; marking it unpaid removes that payment from costs. Salary controls are at `/POS/employees/payroll`. Reconnect once to download payroll costs for offline use.

### Owner, Manager and position salary defaults
Run `npm run migrate:access-roles` in `POS-backend` for local MySQL and `npm run migrate:access-roles -- --supabase` for Supabase before deploying the backend and then frontend. This expands roles, enforces one Owner at database level, and adds effective-month position salary defaults. It preserves existing account roles and does not assign an Owner. Sign in as Admin to add the Owner; Owners and Admins can create/promote Managers. Any signed-in account can create Employees. Managers can manage Employees, Owners can manage Employees/Managers, and only Admin can manage Owner/Admin accounts. Admin accounts are hidden from other roles. Admin/Owner accounts are ineligible for payroll. Position defaults apply by effective month when no individual salary override exists; changing defaults does not rewrite recorded payments. Refresh offline data after deployment; role changes are enforced using the current database role on every server request.
# Shared exchange rate

The exchange rate is stored in `pos_settings` and shared by all registers using the same backend. Before deploying this feature, run `node scripts/migrate-offline.js live` from `POS-backend` for Supabase, or `node scripts/migrate-offline.js local` for MySQL. The migration is additive and safe to rerun.

Connected registers refresh the rate every 15 seconds and on focus. Disconnected registers retain their last fetched rate; changing the shared rate requires an online connection. Receipts retain the rate recorded at checkout.
