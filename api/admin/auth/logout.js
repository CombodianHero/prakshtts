/**
 * POST /api/admin/auth/logout
 */
const { clearSessionCookie } = require("../../../lib/auth");
const { sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;
  clearSessionCookie(res);
  sendJson(res, 200, { success: true });
});
