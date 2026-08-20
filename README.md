# Prakash Tour & Travels — Booking & Travel Management System

Sasaram, Bihar. A real, database-backed booking and travel management
system: customer website, secure booking/payment flow, and an owner
admin panel — running as a single persistent Node/Express service,
deployable on Koyeb via Docker.

## Architecture

```
Customer Website (static html/css/js)
        ↕
Express server (server.js) — one persistent Node process
        ↕
PostgreSQL via Prisma (prisma/schema.prisma)
        ↕
Admin Panel (admin.html)
        ↕
Resend (transactional email) · S3-compatible storage (receipts) · Razorpay (optional online payment)
```

Bookings, payments, vehicles, drivers, invoices, email history, and audit
logs all live in Postgres — nothing business-critical is stored in
`localStorage`. See `STATUS.md` for exactly what's implemented and what's
left before a real launch.

## Structure

```
/
├── server.js               Express entry point — wires every /api route + static site + cron
├── index.html               Customer homepage
├── payment.html               Secure customer payment page (/payment/:token)
├── booking-status.html          Secure booking lookup (Booking ID + email)
├── invoice.html                   Secure invoice view (Booking ID + email), print-to-PDF
├── admin.html                       Owner Control Panel
├── css/styles.css                     Shared navy/gold/cream design system
├── js/
│   ├── api.js                           Single fetch client — every frontend file goes through this
│   ├── data.js                            Marketing content only (destinations/tours/services) + seed data
│   ├── site.js, booking-status.js, payment.js, invoice.js, admin.js
│   └── icons.js
├── api/                      Route handlers (Express-style (req,res) functions, mounted by server.js)
│   ├── bookings/create.js, booking-status.js, vehicles/available.js, queries/create.js, invoices/lookup.js
│   ├── payment/               [token].js, submit.js, create-order.js, verify-gateway.js
│   ├── admin/                 auth/, bookings/, vehicles/, drivers/, payments/, emails/, queries/, dashboard.js, generate-invoice.js, init.js
│   ├── cron/reminders.js      Also exports runReminders() for the in-process scheduler
│   └── _lib/                  resend.js, emailTemplates.js
├── lib/                     Server-only core: db.js, auth.js, calc.js, availability.js, timeline.js,
│                              audit.js, mailer.js, blob.js (S3), ids.js, dto.js, apiUtils.js
├── prisma/schema.prisma     Full production schema
├── Dockerfile               Koyeb build image
├── koyeb.yaml                Optional service manifest
├── .env.example
├── DEPLOYMENT.md            Step-by-step Koyeb deploy guide
└── STATUS.md                Honest record of what's real vs. what's left
```

## Local development

```bash
npm install
cp .env.example .env    # fill in DATABASE_URL at minimum
npx prisma migrate dev --name init
npm run dev              # starts server.js on http://localhost:3000
```

Static pages work without a database, but booking/payment/admin flows
need `DATABASE_URL` set and migrated.

## Deploying to Koyeb

See **`DEPLOYMENT.md`** for the full walkthrough. Short version:

1. Push this repo to GitHub.
2. Koyeb → **Create Service → GitHub** → this repo → Docker builder is
   auto-detected from the `Dockerfile`.
3. Set environment variables (`.env.example` has the full list).
4. Deploy, then run `npx prisma migrate deploy` against production
   `DATABASE_URL`, then bootstrap the first admin via `/api/admin/init`.

## Environment variables

Nothing works end-to-end without real config — there is no
placeholder/demo mode. `.env.example` documents every variable
(database, admin session secret, S3-compatible storage, Resend, optional
Razorpay, cron). Copy it to `.env` for local dev; set the same keys as
Koyeb service environment variables (mark secrets as **Secret** type) for
production.
