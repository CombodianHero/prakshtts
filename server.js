/**
 * server.js — Koyeb entry point.
 *
 * Vercel deployed every file under /api as its own ephemeral serverless
 * function, with file-path-based routing and Vercel-managed static
 * hosting + rewrites/cron on the side. Koyeb runs this as one persistent
 * Node container instead, so this file does three things Vercel used to
 * do for free:
 *   1. Serves the static site (html/css/js) directly.
 *   2. Explicitly wires up every /api/* route to its handler file — the
 *      handler files themselves are UNCHANGED (they already export
 *      Express-style (req, res) functions, since Vercel's Node runtime
 *      mimics the Express req/res API).
 *   3. Runs the payment-reminder job on an in-process schedule instead
 *      of relying on an external cron trigger.
 *
 * Start locally:  node server.js   (or `npm start`)
 * Koyeb sets PORT for you — always listen on process.env.PORT.
 */
const path = require("path");
const express = require("express");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------
   Body parsing
   express.json() only consumes the request stream when
   Content-Type is application/json, so it never interferes with
   the multipart receipt-upload route (api/payment/submit.js),
   which reads the raw stream itself via busboy.
   ------------------------------------------------------------ */
app.use(express.json({ limit: "2mb" }));
app.set("trust proxy", true); // Koyeb terminates TLS at its edge and proxies over HTTP

/* ------------------------------------------------------------
   Dynamic-route param bridge
   Vercel's file-based dynamic routes (e.g. api/payment/[token].js)
   read the segment from req.query.token. Express puts path
   params in req.params instead. Rather than touching those
   handler files, every route registered with a :param below
   merges req.params into req.query first, so the original
   handler code works unmodified.
   ------------------------------------------------------------ */
function withParams(handler) {
  return (req, res, next) => {
    if (req.params && Object.keys(req.params).length) {
      req.query = { ...req.query, ...req.params };
    }
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/* ------------------------------------------------------------
   API ROUTES — mirrors the original api/ file tree exactly.
   Static/named paths are registered before any sibling :param
   route so e.g. "/api/admin/bookings/list" never gets swallowed
   by "/api/admin/bookings/:id".
   ------------------------------------------------------------ */

// Customer-facing
app.post("/api/bookings/create", withParams(require("./api/bookings/create")));
app.post("/api/booking-status", withParams(require("./api/booking-status")));
app.get("/api/vehicles/available", withParams(require("./api/vehicles/available")));
app.post("/api/queries/create", withParams(require("./api/queries/create")));
app.post("/api/invoices/lookup", withParams(require("./api/invoices/lookup")));

// Payments (customer-facing)
app.get("/api/payment/create-order", (req, res) => res.status(405).json({ error: "Use POST." }));
app.post("/api/payment/create-order", withParams(require("./api/payment/create-order")));
app.post("/api/payment/verify-gateway", withParams(require("./api/payment/verify-gateway")));
app.post("/api/payment/submit", withParams(require("./api/payment/submit")));
app.get("/api/payment/:token", withParams(require("./api/payment/[token]")));

// Admin — auth
app.post("/api/admin/auth/login", withParams(require("./api/admin/auth/login")));
app.post("/api/admin/auth/logout", withParams(require("./api/admin/auth/logout")));
app.get("/api/admin/auth/me", withParams(require("./api/admin/auth/me")));
app.post("/api/admin/init", withParams(require("./api/admin/init")));
app.post("/api/admin/create-admin", withParams(require("./api/admin/create-admin")));

// Admin — dashboard
app.get("/api/admin/dashboard", withParams(require("./api/admin/dashboard")));

// Admin — bookings (static paths BEFORE the /:id catch-all)
app.get("/api/admin/bookings/list", withParams(require("./api/admin/bookings/list")));
app.post("/api/admin/bookings/approve", withParams(require("./api/admin/bookings/approve")));
app.post("/api/admin/bookings/reject", withParams(require("./api/admin/bookings/reject")));
app.post("/api/admin/bookings/assign-vehicle", withParams(require("./api/admin/bookings/assign-vehicle")));
app.post("/api/admin/bookings/assign-driver", withParams(require("./api/admin/bookings/assign-driver")));
app.post("/api/admin/bookings/update-trip-status", withParams(require("./api/admin/bookings/update-trip-status")));
app.post("/api/admin/bookings/add-charge", withParams(require("./api/admin/bookings/add-charge")));
app.post("/api/admin/bookings/finalize-charges", withParams(require("./api/admin/bookings/finalize-charges")));
app.get("/api/admin/bookings/:id", withParams(require("./api/admin/bookings/[id]")));

// Admin — invoices
app.post("/api/admin/generate-invoice", withParams(require("./api/admin/generate-invoice")));

// Admin — vehicles
app.get("/api/admin/vehicles/list", withParams(require("./api/admin/vehicles/list")));
app.post("/api/admin/vehicles/create", withParams(require("./api/admin/vehicles/create")));
app.post("/api/admin/vehicles/update", withParams(require("./api/admin/vehicles/update")));

// Admin — drivers
app.get("/api/admin/drivers/list", withParams(require("./api/admin/drivers/list")));
app.post("/api/admin/drivers/create", withParams(require("./api/admin/drivers/create")));
app.post("/api/admin/drivers/update", withParams(require("./api/admin/drivers/update")));

// Admin — payments
app.post("/api/admin/payments/verify", withParams(require("./api/admin/payments/verify")));
app.post("/api/admin/payments/send-reminder", withParams(require("./api/admin/payments/send-reminder")));

// Admin — emails
app.get("/api/admin/emails/list", withParams(require("./api/admin/emails/list")));
app.post("/api/admin/emails/resend", withParams(require("./api/admin/emails/resend")));

// Admin — customer queries
app.get("/api/admin/queries/list", withParams(require("./api/admin/queries/list")));
app.post("/api/admin/queries/respond", withParams(require("./api/admin/queries/respond")));

// Manual/external cron trigger (optional — see the in-process scheduler below)
app.get("/api/cron/reminders", withParams(require("./api/cron/reminders")));

/* ------------------------------------------------------------
   Pretty customer URLs
   Replaces the "rewrites" block from the old vercel.json.
   ------------------------------------------------------------ */
app.get("/payment/:token", (req, res) => {
  res.redirect(302, `/payment.html?token=${encodeURIComponent(req.params.token)}`);
});
app.get("/invoice/:bookingId", (req, res) => {
  res.redirect(302, `/invoice.html?bookingId=${encodeURIComponent(req.params.bookingId)}`);
});

/* ------------------------------------------------------------
   Static site (index.html, admin.html, css/, js/, etc.)
   ------------------------------------------------------------ */
app.use(
  express.static(__dirname, {
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("admin.html")) {
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
      }
    },
  })
);

/* ------------------------------------------------------------
   404 + error handling
   ------------------------------------------------------------ */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found." });
  }
  res.status(404).sendFile(path.join(__dirname, "index.html"), (err) => {
    if (err) res.status(404).send("Not found");
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[unhandled error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong on our end. Please try again shortly." });
});

/* ------------------------------------------------------------
   In-process payment-reminder scheduler (Part 34)
   Runs daily at 09:00 server time. Koyeb keeps this container
   alive continuously, so a plain node-cron job replaces what
   Vercel Cron used to trigger externally — no separate
   infrastructure needed. Disable by setting DISABLE_CRON=true
   (e.g. if you're running the reminder job as its own Koyeb
   service instead, or triggering /api/cron/reminders manually).
   ------------------------------------------------------------ */
if (process.env.DISABLE_CRON !== "true") {
  const { runReminders } = require("./api/cron/reminders");
  cron.schedule(process.env.REMINDER_CRON_SCHEDULE || "0 9 * * *", async () => {
    try {
      const sent = await runReminders();
      console.log(`[cron] payment reminders: ${sent} sent`);
    } catch (err) {
      console.error("[cron] payment reminders failed:", err);
    }
  });
}

app.listen(PORT, () => {
  console.log(`Prakash Tour & Travels server listening on port ${PORT}`);
});
