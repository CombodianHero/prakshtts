/**
 * POST /api/admin/create-admin — add another admin account. Requires an
 * existing valid admin session (Part 35/36).
 */
const { prisma } = require("../../lib/db");
const { hashPassword, requireAdmin } = require("../../lib/auth");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  const { username, password, name } = await readJsonBody(req);
  if (!username || !password || password.length < 10) {
    return sendJson(res, 400, { error: "username and a password of at least 10 characters are required." });
  }
  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.create({ data: { username, passwordHash, name: name || null } });
  sendJson(res, 201, { success: true, admin: { username: admin.username } });
}));
