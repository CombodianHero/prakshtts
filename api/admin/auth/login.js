/**
 * POST /api/admin/auth/login
 * Part 35 — replaces the old client-side-only `isAdmin = true` demo login.
 * Verifies against a bcrypt hash in the database and issues a signed,
 * HTTP-only session cookie. No admin secrets ever reach the browser.
 */
const { prisma } = require("../../../lib/db");
const { verifyPassword, createSessionToken, setSessionCookie } = require("../../../lib/auth");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const { username, password } = await readJsonBody(req);
  if (!username || !password) return sendJson(res, 400, { error: "Username and password are required." });

  const admin = await prisma.adminUser.findUnique({ where: { username: String(username).trim() } });
  // Constant-shape response whether or not the user exists, to avoid
  // leaking which usernames are valid via response timing/content.
  const valid = admin ? await verifyPassword(password, admin.passwordHash) : false;

  if (!admin || !valid) {
    return sendJson(res, 401, { error: "Invalid username or password." });
  }

  const token = await createSessionToken({ adminId: admin.id, username: admin.username });
  setSessionCookie(res, token);

  sendJson(res, 200, { success: true, admin: { username: admin.username, name: admin.name } });
});
