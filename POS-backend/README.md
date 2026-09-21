# POS backend

For Vercel + Supabase setup, see [the deployment guide](../DEPLOYMENT.md). Set `DATABASE_URL` to enable PostgreSQL; otherwise the existing local MySQL configuration is used. The commands below describe the legacy MySQL installation.

Run from this directory with the existing database settings in `.env`:

```powershell
npm run migrate:scheduling-payroll
npm start
```

The scheduling/payroll migration is repeatable and applies to a database with the existing employee and workflow schema. It adds repeating schedule rules, cancellation markers, salary rate history, refund deductions, and payment records. Existing rejected refunds are backfilled when their order price is available. Old rejections without an available price appear as unresolved on the employee salary card.

## Weekly repeating shifts

In Shifts, choose a starting date and employee, enter the hours, enable weekly repetition, and select Monday through Sunday. Rules repeat on the selected weekdays every week with no fixed end date. Occurrences are generated and stored for the calendar range or bot week being requested. The API accepts `weekdays` as ISO weekday numbers (Monday = 1, Sunday = 7). Existing monthly rules, if any, retain their original dates; new schedules use weekdays.

Removing an occurrence cancels that date only. Stopping a schedule cancels occurrences on and after the chosen stop date, preserving earlier shifts and shifts with pending or approved check-ins. A unique rule/date key prevents duplicate occurrences or regeneration of cancelled shifts.

`GET /api/shifts` accepts `from` and `to` (inclusive, up to 94 days); without them it returns the current month. Employee users see their own shifts. Schedule changes require administrator access.

## Salaries and attendance

Employee Management includes monthly salary cards. Salary rates are stored in USD, use the app's existing currency conversion in the form/display, and apply from the selected month until another rate takes effect. Previous months retain their earlier rates.

Rejecting a refund adds the full original order price to the requesting employee's deductions in the rejection month. The same order is charged at most once per employee. Amounts are captured from order records, not submitted by the browser. Missing historical amounts are identified rather than treated as zero.

Payment buttons record payment status; they do not transfer funds. A later salary/deduction change produces an adjustment status if the recorded payment no longer matches the payable amount. Payment status changes have an audit trail in `payroll_payment_events`. Deductions exceeding salary are shown, with zero payable and no automatic carry-forward.

Bot `/checkin` uses the server's calendar date. With multiple shifts today, use `/checkin SHIFT_ID` to select the correct one. Check-in ownership and duplicate submissions are validated on the server. Attendance uses request arrival time, preserving it when the manager approves later. Lateness is shown in minutes, with no salary penalty. Restart an existing bot process after updating `telegram-bot/bot.js`.

## Verification

```powershell
npm test
npm run test:integration
```

Integration tests create an isolated `pos_feature_test_*` database, copy schema only, exercise authenticated HTTP routes, and remove the database afterward. The configured database account needs permission to create and drop this temporary test database. Real employee, salary, order, and Telegram records are not used as test data.
