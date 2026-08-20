/**
 * POST /api/admin/drivers/update   { driverId, ...fields }
 * Deactivate via status: "INACTIVE" rather than deleting — preserves
 * historical driver info connected to old bookings (Part 2.4).
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { addAuditLog } = require("../../../lib/audit");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

const VALID_STATUS = ["AVAILABLE", "ASSIGNED", "ON_TRIP", "UNAVAILABLE", "INACTIVE"];
const EDITABLE_FIELDS = ["driverName", "phone", "email", "defaultVehicleId", "notes"];

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const body = await readJsonBody(req);
  const { driverId } = body;
  if (!driverId) return sendJson(res, 400, { error: "driverId is required." });

  const existing = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!existing) return sendJson(res, 404, { error: "Driver not found." });

  if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
    return sendJson(res, 400, { error: `status must be one of ${VALID_STATUS.join(", ")}.` });
  }

  const data = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) data[field] = body[field];
  if (body.status !== undefined) data.status = body.status;

  const driver = await prisma.driver.update({ where: { id: driverId }, data });
  await addAuditLog({ adminId: session.adminId, actionType: "DRIVER_UPDATED", entityType: "Driver", entityId: driverId, oldValue: existing, newValue: driver });

  sendJson(res, 200, { success: true, driver });
}));
