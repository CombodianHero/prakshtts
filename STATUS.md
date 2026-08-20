# STATUS — Production Upgrade Progress

## Koyeb port (this update)

The system was originally built for Vercel (per-file serverless
functions, `vercel.json` rewrites/cron, Vercel Blob storage). It's now
rewired to run as a single persistent Express service for Koyeb:

- **`server.js`** (new) — Express app that mounts every handler in
  `api/*.js` as an explicit route. The handler files themselves are
  **unchanged** — Vercel's Node runtime already mimics the Express
  `req`/`res` API, so `res.status(x).json(y)` etc. worked as-is.
- **Fixed a real bug** in `lib/apiUtils.js`'s `sendJson()`: it chained
  `.setHeader(...)` after `.status(...)`, which happened to work under
  Vercel's Express-like response bridge but throws under real Express
  (`res.setHeader` isn't chainable there). Removed the redundant call —
  `res.json()` already sets `Content-Type`.
- **`lib/blob.js` rewritten** to use the AWS S3 SDK against any
  S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) —
  Koyeb has no built-in blob storage like Vercel does. Config via
  `S3_*` env vars.
- **`api/cron/reminders.js` refactored** to export a plain
  `runReminders()` function alongside the HTTP handler. `server.js` runs
  it on an in-process `node-cron` schedule (daily 09:00 by default),
  since Koyeb keeps the container alive continuously — no external cron
  trigger is required (the HTTP endpoint still exists if you'd rather
  trigger it externally).
- **`Dockerfile` + `koyeb.yaml` added**, `vercel.json` removed.
- `package.json`: added `express`, `node-cron`, `@aws-sdk/client-s3`;
  removed `@vercel/blob`; `start`/`dev` now both run `node server.js`.
- Docs (`README.md`, `DEPLOYMENT.md`) rewritten for the Koyeb flow.

**Verified in this environment:** `npm install` succeeds with the new
dependency set, every file passes `node -c` (syntax check), every
relative `require()` resolves, and `server.js` boots up to the point of
initializing Prisma. **Not verified:** `prisma generate` — this sandbox
can't reach `binaries.prisma.sh` (network policy), so the Prisma client
was never actually instantiated end-to-end here. This is a sandbox
limitation, not a code issue — Koyeb's own Docker build environment has
normal internet access and should generate the client fine as part of
`npm install`'s `postinstall` step (schema is copied into the image
before `npm install` runs, specifically to make this work — see
`Dockerfile`).

---

This documents exactly what has been converted from the original
localStorage/demo project to real, database-backed production
functionality, and what's still left before this can safely handle real
customers and money.

## ✅ Done — real, working code

**Database** (`prisma/schema.prisma`)
Full schema matching the spec: Booking, Customer, Vehicle, Driver, Payment,
PaymentRequest, AdditionalCharge, BookingTimeline, Invoice, EmailLog,
AuditLog, CustomerQuery, AdminUser, ReminderLog. Three independent status
enums (BookingStatus / PaymentStatusOverall / TripStatus) as required.
**Not yet run against a real database** — see the Koyeb port note above.

**Server-side core** (`lib/`)
- `db.js` — Prisma client singleton
- `calc.js` — the ONLY place that computes advance/remaining/final/outstanding amounts
- `auth.js` — bcrypt + signed HTTP-only JWT admin sessions (no more `isAdmin=true`)
- `availability.js` — server-side vehicle/driver date-overlap conflict checks
- `timeline.js` / `audit.js` — persistent timeline + audit log writers
- `mailer.js` — sends via Resend and permanently logs every attempt (success or failure)
- `blob.js` — real S3-compatible receipt uploads (JPG/PNG/WEBP/PDF, 8MB cap)
- `ids.js` — server-generated `TRV-2026-00001`, `PTT-INV-2026-00001`, and 256-bit secure payment tokens
- `dto.js` — customer-safe response shapes (never leaks internal IDs/admin data)

**APIs** (39 files under `api/`, all syntax-checked, all mounted explicitly in `server.js`)
- Customer: create booking, secure booking-status lookup, live vehicle
  availability, secure payment-token page, receipt upload, raise a query,
  secure invoice lookup
- Admin: login/logout/session/bootstrap, bookings list/detail/approve/
  reject/assign-vehicle/assign-driver/trip-status/charges/finalize-charges,
  payment verify + manual reminder, vehicles CRUD, drivers CRUD, dashboard
  stats, generate-invoice, email history + resend, queries list/respond
- Payments: manual UPI + receipt (always available), Razorpay gateway
  (optional — only activates if `RAZORPAY_KEY_ID`/`SECRET` are set), signature

  verified server-side, never trusts a client "payment successful"
- `api/cron/reminders.js` — scheduled reminder job (wired into `vercel.json` crons)

**Frontend**, rewired to call the real APIs (`js/api.js` is the single
fetch layer):
- `site.js` — booking form now creates a real server-side booking; the
  vehicle dropdown fetches live availability instead of a hardcoded list
- `booking-status.js` — full rewrite against `POST /api/booking-status`,
  renders the real DTO (status, payment breakdown, vehicle/driver, real
  timeline events, invoice link, "raise a query" form)
- `payment.js` — full rewrite against the secure `/payment/:token` page:
  real QR, real receipt upload, optional Razorpay checkout
- `invoice.js` — full rewrite: secure bookingId+email gate, renders the
  real invoice DTO (never client-generates an invoice number anymore)
- `admin.js` — full rewrite: real login, real dashboard stats, real
  bookings list/detail with approve/reject/assign/charges/verify/
  generate-invoice, a genuine Fleet Vehicles admin (replacing the old
  marketing-only vehicle list), a new Drivers admin, and a Customer
  Queries admin

**Removed**: `js/mailer-client.js` and `api/send-email.js` (the old
client-driven, localStorage-logging email path) — replaced by
`lib/mailer.js`, which is server-only and writes to the real `EmailLog`
table.

## ⚠️ Known gaps / next steps

1. **Schema never run against a live Postgres** (see the Koyeb port note
   at the top of this file for why). Run `npx prisma migrate deploy` (or
   `migrate dev --name init` if no migrations exist yet) against your
   real `DATABASE_URL` as the first setup step.
2. **No live end-to-end test was possible in this sandbox** (no outbound
   DB, no Resend/S3/Razorpay credentials, no deployed URL). Everything
   here is code-reviewed and syntax-checked, not integration-tested.
   Budget time to walk the full flow in Part 47 of the original spec
   once deployed to Koyeb.
3. **Bootstrap the first admin account** via
   `POST /api/admin/init` with header `Authorization: Bearer <ADMIN_SESSION_SECRET>`
   and body `{ "username": "...", "password": "..." }` (min 10 chars).
   There is no default admin — this is intentional.
4. **Destinations / Tour Packages / Services** remain static
   localStorage-backed marketing content, edited from Admin → Destinations
   /Tours/Services. This was a deliberate scope call — they aren't part of
   the spec's required database entities (Part 2), and keeping them simple
   avoids a large low-value CMS build. Business data (bookings, payments,
   vehicles-as-fleet, drivers, invoices, emails, audit logs) is fully on
   the database.
5. **Invoice "PDF"** is an HTML page (`invoice.html`) meant to be printed /
   saved as PDF from the browser (`window.print()`), not a server-rendered
   PDF file. This matches the original project's approach and avoids
   pulling in a heavy headless-browser PDF pipeline; swap in
   `/mnt/skills/public/pdf` (or a service like `@react-pdf/renderer`) if a
   true PDF file/API response is required.
6. **Payment receipt access control**: `lib/blob.js` uploads with
   `ACL: "public-read"`. Anyone with the exact random URL can view a
   receipt, but URLs aren't discoverable/listed anywhere public. For
   stricter control, drop the public ACL and generate short-lived
   presigned GET URLs per admin request instead (`@aws-sdk/s3-request-presigner`).
7. **Rate limiting** on `/api/booking-status` is in-memory per server
   process. Since Koyeb runs this as a single persistent instance (per
   the default `scaling: min:1, max:1` in `koyeb.yaml`), this actually
   works correctly here — it just won't coordinate correctly if you scale
   to multiple instances. Move to a shared store (Redis, Koyeb's Redis
   add-on) if you scale out and abuse becomes a concern.
8. **CSS status colors**: new enum values got matching `.status-*` classes
   in `css/styles.css`; sanity-check them visually once deployed.
9. **Testing checklist (Part 47 of the original spec)** has not been
   executed — do this against a real deployment before launch.

## Setup order (recommended)

1. Create a Postgres DB (Neon/Supabase/Koyeb's Postgres add-on) → set `DATABASE_URL`
2. `npm install` → `npx prisma migrate dev --name init` → `npx prisma generate`
3. Set `ADMIN_SESSION_SECRET` (`openssl rand -base64 32`)
4. Bootstrap the first admin via `POST /api/admin/init` (see above)
5. Set up an S3-compatible bucket (S3/R2/B2/MinIO) → `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
6. Set up Resend → `RESEND_API_KEY`, `EMAIL_FROM`
7. Set `APP_URL` to your real Koyeb app URL
8. (Optional) Set `RAZORPAY_KEY_ID`/`SECRET` for instant online payment
9. (Optional) Set `CRON_SECRET` if you'd rather trigger reminders externally instead of the in-process schedule
10. Deploy (see `DEPLOYMENT.md`), log into `/admin.html`, add real vehicles + drivers, then run
    through the Part 47 testing checklist end to end.
