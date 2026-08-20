/**
 * POST /api/admin/init
 * One-time admin bootstrap. Only works when NO AdminUser row exists yet AND
 * the caller supplies ADMIN_SESSION_SECRET as a bearer token (proves they
 * have server env access, e.g. via Vercel dashboard) — this avoids shipping
 * a hardcoded default admin password, per Part 35.
 *
 * After the first admin is created, this endpoint always 403s. To add more
 * admins later, use an authenticated admin session instead (see
 * api/admin/create-admin.js).
 */
const { prisma } = require("../../lib/db");
const { hashPassword } = require("../../lib/auth");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  const existingCount = await prisma.adminUser.count();
  if (existingCount > 0) {
    return sendJson(res, 403, { error: "An admin account already exists. Use /api/admin/create-admin (while logged in) to add more." });
  }

  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!bearer || !process.env.ADMIN_SESSION_SECRET || bearer !== process.env.ADMIN_SESSION_SECRET) {
    return sendJson(res, 403, { error: "Unauthorized bootstrap attempt." });
  }

  const { username, password, name } = await readJsonBody(req);
  if (!username || !password || password.length < 10) {
    return sendJson(res, 400, { error: "username and a password of at least 10 characters are required." });
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.create({ data: { username, passwordHash, name: name || null } });

  sendJson(res, 201, { success: true, admin: { username: admin.username } });
});
