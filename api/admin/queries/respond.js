/**
 * POST /api/admin/queries/respond   { queryId, adminResponse, status? }
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { addAuditLog } = require("../../../lib/audit");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

const VALID_STATUS = ["OPEN", "UNDER_REVIEW", "RESOLVED"];

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { queryId, adminResponse, status } = await readJsonBody(req);
  if (!queryId) return sendJson(res, 400, { error: "queryId is required." });
  if (status !== undefined && !VALID_STATUS.includes(status)) return sendJson(res, 400, { error: "Invalid status." });

  const existing = await prisma.customerQuery.findUnique({ where: { id: queryId } });
  if (!existing) return sendJson(res, 404, { error: "Query not found." });

  const query = await prisma.customerQuery.update({
    where: { id: queryId },
    data: { adminResponse: adminResponse !== undefined ? adminResponse : existing.adminResponse, status: status || (adminResponse ? "RESOLVED" : existing.status) },
  });

  await addAuditLog({ adminId: session.adminId, actionType: "QUERY_RESPONDED", entityType: "CustomerQuery", entityId: queryId, oldValue: existing, newValue: query });

  sendJson(res, 200, { success: true, query });
}));
