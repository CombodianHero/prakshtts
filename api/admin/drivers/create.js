const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { addAuditLog } = require("../../../lib/audit");
const { readJsonBody, sendJson, methodGuard, withErrorHandling } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const { driverName, phone, email, defaultVehicleId, notes } = await readJsonBody(req);
  if (!driverName || !phone) return sendJson(res, 400, { error: "driverName and phone are required." });

  const driver = await prisma.driver.create({
    data: { driverName, phone, email: email || null, defaultVehicleId: defaultVehicleId || null, notes: notes || null, status: "AVAILABLE" },
  });

  await addAuditLog({ adminId: session.adminId, actionType: "DRIVER_CREATED", entityType: "Driver", entityId: driver.id, oldValue: null, newValue: driver });
  sendJson(res, 201, { success: true, driver });
}));
