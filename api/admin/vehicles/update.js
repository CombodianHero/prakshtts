/**
 * POST /api/admin/vehicles/update
 * Body: { vehicleId, ...fieldsToChange }
 * Never deletes a vehicle (Part 7) — use status: "INACTIVE" to deactivate,
 * which preserves history for old bookings that reference it.
 */
const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { addAuditLog } = require("../../../lib/audit");
const { readJsonBody, sendJson, methodGuard, withErrorHandling, toNumber } = require("../../../lib/apiUtils");

const VALID_STATUS = ["AVAILABLE", "RESERVED", "ON_TRIP", "MAINTENANCE", "UNAVAILABLE", "INACTIVE"];
const EDITABLE_FIELDS = ["vehicleName", "vehicleType", "vehicleNumber", "description", "imageUrl"];

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const body = await readJsonBody(req);
  const { vehicleId } = body;
  if (!vehicleId) return sendJson(res, 400, { error: "vehicleId is required." });

  const existing = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!existing) return sendJson(res, 404, { error: "Vehicle not found." });

  if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
    return sendJson(res, 400, { error: `status must be one of ${VALID_STATUS.join(", ")}.` });
  }

  const data = {};
  for (const field of EDITABLE_FIELDS) if (body[field] !== undefined) data[field] = body[field];
  if (body.seatingCapacity !== undefined) data.seatingCapacity = Math.max(1, toNumber(body.seatingCapacity, existing.seatingCapacity));
  if (body.features !== undefined) data.features = Array.isArray(body.features) ? body.features : existing.features;
  if (body.status !== undefined) data.status = body.status;
  if (body.bookingEnabled !== undefined) data.bookingEnabled = Boolean(body.bookingEnabled);
  if (body.recommended !== undefined) data.recommended = Boolean(body.recommended);

  const vehicle = await prisma.vehicle.update({ where: { id: vehicleId }, data });

  await addAuditLog({ adminId: session.adminId, actionType: "VEHICLE_UPDATED", entityType: "Vehicle", entityId: vehicleId, oldValue: existing, newValue: vehicle });

  sendJson(res, 200, { success: true, vehicle });
}));
