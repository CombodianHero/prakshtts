/**
 * lib/auth.js
 * Real server-side admin authentication (Part 35).
 * - Passwords hashed with bcrypt, never stored/compared in plaintext.
 * - Sessions are signed JWTs in an HTTP-only, Secure, SameSite=Lax cookie.
 * - ADMIN_SESSION_SECRET must be set in the environment — a missing
 *   secret is a hard failure, not a fallback to an insecure default.
 */
const bcrypt = require("bcryptjs");
const { SignJWT, jwtVerify } = require("jose");

const COOKIE_NAME = "ptt_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function getSecretKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set (or too short). Generate one with `openssl rand -base64 32` and add it as a Vercel environment variable."
    );
  }
  return new TextEncoder().encode(secret);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function createSessionToken({ adminId, username }) {
  return new SignJWT({ adminId, username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload; // { adminId, username, iat, exp }
  } catch (e) {
    return null;
  }
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  const match = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Verifies the admin session cookie on an incoming request.
 * Returns the session payload, or null if not authenticated.
 * Use this — NEVER a client-sent `isAdmin: true` flag — as the source
 * of authorization for every admin API route.
 */
async function getAdminSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Wraps an API handler so it 401s unless a valid admin session is present.
 * Usage: module.exports = requireAdmin(async (req, res, session) => {...})
 */
function requireAdmin(handler) {
  return async (req, res) => {
    const session = await getAdminSession(req);
    if (!session) {
      res.status(401).json({ error: "Not authenticated. Please log in as admin." });
      return;
    }
    return handler(req, res, session);
  };
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  setSessionCookie,
  clearSessionCookie,
  getAdminSession,
  requireAdmin,
};
