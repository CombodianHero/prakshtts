# Deploying Prakash Tour & Travels to Koyeb

This app is a persistent Node/Express server (`server.js`) + PostgreSQL
(via Prisma) + S3-compatible object storage, packaged with a `Dockerfile`.
Koyeb builds and runs the Dockerfile directly as a Web Service.

## 1. Prerequisites

- A Koyeb account ([koyeb.com](https://www.koyeb.com))
- A Postgres database reachable from Koyeb (Neon, Supabase, Koyeb's own
  managed Postgres add-on, or any other host) — get its `DATABASE_URL`
- An S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2,
  DigitalOcean Spaces, or self-hosted MinIO) — get bucket name + access
  keys
- A [Resend](https://resend.com) API key for transactional email
- This repo pushed to GitHub/GitLab (or use the Koyeb CLI to deploy from
  a local Docker build)

## 2. Create the database schema

Locally, with `DATABASE_URL` pointed at your real Postgres instance:

```bash
npm install
npx prisma migrate deploy
```

(Use `npx prisma migrate dev --name init` instead the very first time, if
no migrations exist yet in `prisma/migrations/`.)

## 3. Create the Koyeb service

**Via the dashboard:**
1. Koyeb → **Create Service → GitHub** → select this repo/branch.
2. Koyeb will detect the `Dockerfile` automatically (Builder: Docker).
3. Set the port to `8000` (matches `EXPOSE 8000` in the Dockerfile — Koyeb
   also reads `PORT` from the container, which the Dockerfile sets).
4. Add environment variables (see step 4).
5. Deploy.

**Via the CLI**, from the project root:

```bash
koyeb login
koyeb app init prakash-tour-travels
koyeb service create web \
  --app prakash-tour-travels \
  --git github.com/<you>/<repo> \
  --git-branch main \
  --git-builder docker \
  --ports 8000:http \
  --routes /:8000
```

Or use the included `koyeb.yaml` manifest with `koyeb deploy`.

## 4. Environment variables

Set these in the Koyeb dashboard (Service → Settings → Environment
variables) or via `koyeb service update ... --env KEY=value`. Mark
secrets (`DATABASE_URL`, `ADMIN_SESSION_SECRET`, API keys) as **Secret**
type, not plain text. Full reference: `.env.example`.

Required:
```
NODE_ENV=production
DATABASE_URL=
ADMIN_SESSION_SECRET=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
RESEND_API_KEY=
APP_URL=https://<your-app>.koyeb.app
```

Optional:
```
S3_ENDPOINT=            # required for R2/B2/MinIO, blank for real AWS S3
S3_REGION=auto
S3_FORCE_PATH_STYLE=false
S3_PUBLIC_URL_BASE=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
CRON_SECRET=
REMINDER_CRON_SCHEDULE="0 9 * * *"
DISABLE_CRON=false
```

## 5. Bootstrap the first admin account

There's no default admin. Once deployed, create the first one:

```bash
curl -X POST https://<your-app>.koyeb.app/api/admin/init \
  -H "Authorization: Bearer <your ADMIN_SESSION_SECRET value>" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"a-real-strong-password-here"}'
```

This endpoint 403s once any admin account already exists — it's a
one-time bootstrap, not an open signup route. Log in at
`https://<your-app>.koyeb.app/admin.html`.

## 6. Custom domain

Koyeb → your service → **Domains** → add your domain, then create the
CNAME record it shows you at your DNS provider. Update `APP_URL` to match
once it's live (this is what gets used to build links inside emails).

## 7. Scheduled payment reminders

The reminder job (Part 34) runs in-process via `node-cron` inside
`server.js` — no separate cron infrastructure needed, since Koyeb keeps
the container running continuously (unlike Vercel's ephemeral
functions). It fires daily at 09:00 server time by default
(`REMINDER_CRON_SCHEDULE`). To trigger it externally instead (e.g. from
a separate Koyeb Cron Job service, or a health-check style pinger), hit
`GET /api/cron/reminders` with header `Authorization: Bearer <CRON_SECRET>`
and set `DISABLE_CRON=true` to turn off the in-process schedule.

## 8. Redeploys

Any push to the connected branch triggers a new Koyeb build automatically
(if auto-deploy is enabled), or trigger manually via
`koyeb service redeploy web --app prakash-tour-travels`. Database schema
changes need `npx prisma migrate deploy` run against production
`DATABASE_URL` separately — Koyeb doesn't run migrations for you.
