# Dispatch App (Crown Traffic Management)

Internal dispatch / timesheet / payroll-and-invoicing automation app. Fully
independent from the `client/` project in this repo (tmpbuilder.ca) — own
package, own Supabase project, own Vercel deployment. See
`../.claude/plans/cozy-brewing-sparrow.md` (or ask Claude) for the full build
plan.

## Phase 0 finding: QuickBooks Payroll (confirmed 2026-09-14)

Checked against your connected QuickBooks company, **Crown Traffic Management
Ltd.** (read-only calls only — nothing was created or changed):

- Initially, `qbo_payroll_get_employer_tax_setup` errored with a permissions
  message, so the connector was reconnected with expanded access.
- After reconnecting, the permissions error was gone — but `get_employees`
  and `get_pay_schedules` still returned zero results.
- You confirmed directly in QuickBooks (**Settings → Payroll**) that Payroll
  is genuinely active: a funded bank account, 2-day direct deposit, British
  Columbia tax withholding, and workers' comp are all configured.

**Conclusion: this is not a setup gap or a permissions gap — it's a data-
access limitation of this specific QuickBooks integration.** It can read
standard Accounting data (invoices, customers, items — all working, and your
existing invoices already use a `LCT`/`TCP` rate-item system with
regular/overtime/doubletime/night variants that Phase 3 will reuse directly),
but it cannot see anything in the Payroll module even though real payroll
exists on the account.

**Decision: Phase 3 does not attempt direct payroll-run automation.** Instead,
approved employee hours are pushed into QuickBooks as `TimeActivity` entries
(a standard Accounting API object, fully supported), and you click "Run
Payroll" in QuickBooks yourself once the hours are already there — no manual
re-entry, just not the final click. Worth a non-blocking check with your
accountant or Intuit support on whether a certified payroll-API partnership
exists, but the build won't wait on that.

## What's built (Phase 1: core dispatch + timesheet MVP)

- Vite + React 19 app shell, PWA manifest + service worker (installable to a
  phone's home screen, no app store needed).
- Supabase Auth login (`src/routes/Login.jsx`) with role-based routing
  (`src/App.jsx`) — no public sign-up, admin-provisioned accounts only.
- **Admin**: dashboard listing every dispatch with live timesheet status
  (`src/routes/admin/Dashboard.jsx`), a dispatch-creation form with optional
  attachment upload (`DispatchForm.jsx`), an approval queue showing each
  submitted slip's photo side-by-side with typed times and calculated hours
  with approve/reject actions (`ApprovalQueue.jsx`), and an "Add Worker"
  screen for provisioning employee/contractor accounts (`AddWorker.jsx`).
- **Worker**: "My Dispatches" list with per-shift status
  (`src/routes/worker/MyDispatches.jsx`), and a timesheet submission form —
  camera-capture photo input + typed start/end time + break minutes, with a
  live hours preview (`SubmitTimesheet.jsx`).
- API endpoints (`api/dispatches.js`, `api/timesheets.js`, `api/workers.js`,
  `api/uploads.js`) covering: create/list dispatches, submit/list/review
  timesheets, list/create workers, and signed upload URLs for the two private
  Storage buckets. Every admin-only action is gated by `requireRole()`
  (`api/_lib/auth.js`); a worker can only ever act on their own dispatches.
- Full database schema at `supabase/migrations/0001_init.sql` (tables +
  row-level security) and `0002_storage_buckets.sql` (the two private
  buckets, no public access — all photo access goes through short-lived
  signed URLs minted server-side).
- `scripts/create-admin.js` — bootstraps the first admin account (there's no
  sign-up screen by design).

**Verified end-to-end (2026-09-14)** against the real Supabase project:
logged in as admin, created a worker, sent a dispatch, submitted a timesheet
(photo + typed hours), and approved it — the full loop works. One real bug
was found and fixed along the way: Supabase returns a 1:1 relationship
(`dispatches` → `timesheets`, since `timesheets.dispatch_id` is unique) as a
single object, not an array — `Dashboard.jsx` and `MyDispatches.jsx` were
both reading it as `dispatch.timesheets?.[0]`, which is now just
`dispatch.timesheets`. Worth remembering for any future query that embeds
`timesheets` off `dispatches`.

## What's built (Phase 2: reminders + worker history + contractor PDF)

- **Reminders**: `api/cron/reminders.js`, wired to Vercel Cron in
  `vercel.json` (runs daily, decides internally whether today is a 14-day
  reminder day — see `REMINDER_ANCHOR_DATE` in `.env.example` — since
  Vercel's day-of-month cron syntax can't reliably express an exact 14-day
  cadence). Diffs dispatches against submitted timesheets, dedupes via
  `reminder_log` so the same gap isn't re-notified, and sends a Web Push
  notification per worker with outstanding timesheets. Also callable
  on-demand by an authenticated admin — the Dashboard's "Send Reminders Now"
  button hits the same endpoint with `?force=true` to bypass the cadence
  check.
- **Web Push plumbing**: `api/push.js` (subscribe/unsubscribe),
  `api/_lib/push.js` (send helper, drops dead subscriptions on 404/410), and
  an "Enable Reminders" button in `WorkerLayout.jsx` that requests
  notification permission and registers the subscription. Needs
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VITE_VAPID_PUBLIC_KEY` set (generate
  with `npx web-push generate-vapid-keys`) before it'll actually send
  anything — silently unavailable until then, doesn't break the rest of the
  app.
- **Admin "Workers" + per-worker schedule**: `Workers.jsx` lists every
  worker with a link into `WorkerSchedule.jsx`, which shows that worker's
  full dispatch history with hours/status and a "Generate PDF" button
  (`src/lib/pdf/workerSummary.js`, using the same `jsPDF` pattern as
  `client/src/Editor.jsx` — tabular, client-side, no server round-trip).
- Worker "My History" needs is already covered by the existing "My
  Dispatches" view from Phase 1 (it lists full history with status, not just
  actionable items) — no separate page was needed.

**Not built yet**: all QuickBooks sync (Phase 3 — scoped around the
`TimeActivity` fallback per the confirmed Phase 0 finding above) and the
hour-bank ledger (Phase 4). The approval endpoint has a comment marking
exactly where the QuickBooks sync call will hook in.

## Status

- ✅ Supabase project created, both migrations applied, `.env` filled in.
- ✅ Admin account created (`info@crowntraffic.ca`) via `scripts/create-admin.js`.
- ⬜ Not yet deployed anywhere — only runs locally so far. Needs a Vercel
  project pointed at this `dispatch-app/` folder to go live.
- ⬜ QuickBooks OAuth app (developer.intuit.com) — needed starting Phase 3,
  not before.
- ⬜ VAPID keys for real push notifications (`npx web-push generate-vapid-keys`)
  — reminders/notifications silently do nothing without these set.

## Local dev

Two terminals, both in this folder:

```
# Terminal 1 — API functions
npm run api

# Terminal 2 — the app itself
npm run dev
```

Then open the URL the second command prints (typically `http://localhost:5173`).
Both need to stay running while you use the app.
