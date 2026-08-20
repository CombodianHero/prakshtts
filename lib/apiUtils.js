/**
 * lib/apiUtils.js
 * Small shared helpers used across every /api/*.js file.
 */

/** Reads and JSON-parses the request body, whatever shape Vercel gives us. */
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch (e) {
      return {};
    }
  }
  // Fallback: stream not yet consumed by the platform.
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res, status, payload) {
  // res.json() already sets Content-Type: application/json — don't chain
  // .setHeader() here, since plain Node/Express response objects don't
  // return `this` from setHeader() (unlike Vercel's Express-like bridge).
  res.status(status).json(payload);
}

function methodGuard(req, res, methods) {
  const list = Array.isArray(methods) ? methods : [methods];
  if (!list.includes(req.method)) {
    sendJson(res, 405, { error: `Method not allowed. Use ${list.join(" or ")}.` });
    return false;
  }
  return true;
}

/**
 * Wraps a handler so unexpected errors never leak stack traces / secrets to
 * the client. Business-logic errors can set `err.statusCode` (e.g. via
 * `Object.assign(new Error("..."), { statusCode: 409 })`) to control the
 * response code; anything else becomes a generic 500.
 */
function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error("[api error]", err);
      if (!res.headersSent) {
        const status = Number.isInteger(err && err.statusCode) ? err.statusCode : 500;
        sendJson(res, status, {
          error: status < 500 ? err.message : "Something went wrong on our end. Please try again shortly.",
        });
      }
    }
  };
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  readJsonBody,
  sendJson,
  methodGuard,
  withErrorHandling,
  isValidEmail,
  normalizeEmail,
  toNumber,
};
