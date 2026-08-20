/**
 * GET /api/admin/auth/me — used by admin.html on load to check session validity
 * and protect the admin route (Part 35/36).
 */
const { getAdminSession } = require("../../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "GET")) return;
  const session = await getAdminSession(req);
  if (!session) return sendJson(res, 401, { authenticated: false });
  sendJson(res, 200, { authenticated: true, username: session.username });
});
