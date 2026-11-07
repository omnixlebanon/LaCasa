Supabase egress changes
======================

The backend records the last changed revision per SQL table in the existing
`pos_settings` table, in the same transaction as the business operation.
Tracking failures roll back to a savepoint; they do not fail the business write.
Clients fall back to full downloads if tracking is missing, stale, malformed, or
contains an unknown changed table. No production migration was run.

Offline sync is incremental by resource, rather than individual row. Unchanged
resources are reused; changed resources are replaced completely, including
deletions. This retains the existing global revision conflict protection.
The client verifies the revision again after downloading and never installs a
snapshot while local operations are queued. The first download, date rollover,
and permission changes require a full refresh. Snapshot and operation revisions
are tracked separately, so acknowledging a local write cannot hide its changes.

When adding a database table or a read dependency, update
`POS-frontend/src/offline/resources.js`. Unknown tables deliberately invalidate
the whole snapshot. Direct database changes outside the application's middleware
must also advance the global sync revision; this was already required by sync.

Order and stock snapshots retain the recent 90 days. History screens initially
load that window, and provide an explicit online action to load older history.
Online history downloads use pages of at most 500 rows, retrying if the revision
changes between pages. Older offline reports fail explicitly instead of showing
incomplete totals. Historical reports still use transaction rows for the existing
charts and exports; SQL aggregation is a potential further optimization.

History lists select an evidence-present flag instead of transferring stored
refund images. Images are fetched only through the existing evidence endpoint.

The public menu allows CDN caching for 60 seconds. Menu edits may take up to
60 seconds to appear. Error responses remain uncached.

Sales checks a small revision manifest and reloads its data only for relevant
changes, local financial operations, reporting-period selection, or date rollover.
Cart-only changes do not refresh sales. Remote changes are detected within about
15 seconds while visible. Sales, exchange-rate, session, and sync revision polling
pause in hidden tabs and resume when the tab is activated. Pending writes retain
their existing durable save and retry behavior.

Deploy the backend before the frontend so pagination and manifest endpoints are
available. Neither a GitHub push nor deployment was performed during this work.

Validation: 52 frontend tests pass, production build passes, and lint completes
with existing warnings. Backend tests: 64 pass and five existing failures remain
in older chatbot, permission, and recurrence expectations; those failures were
also reproduced in an isolated checkout of the unchanged code. The new backend
tracking, rollback, evidence, and pagination checks pass.

Final Chrome checks cover offline checkout, cash and WHISH payments, receipts,
reconnection, selective sales refresh, hidden-tab polling, older stock history,
and public menu/management layouts at 320, 375, 600, 768, 1024, and 1440 pixels.
A late snapshot cannot replace a newer acknowledged write from another tab.
Incomplete custom report ranges do not download historical transactions.

The isolated Chrome full-day check saved 500 offline orders and 2,500 cart edits,
verified them after a POS reload, and synchronized all orders exactly once.
Backlog synchronization completed in 138.2 seconds in the lightweight harness.
The harness separates the bulk storage/sync exercise from the UI smoke checks
and collects temporary browser garbage periodically to reduce disk pressure.
