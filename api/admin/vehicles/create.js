const { prisma } = require("../../../lib/db");
const { requireAdmin } = require("../../../lib/auth");
const { addAuditLog } = require("../../../lib/audit");
const { readJsonBody, sendJson, methodGuard, withErrorHandling, toNumber } = require("../../../lib/apiUtils");

module.exports = withErrorHandling(requireAdmin(async (req, res, session) => {
  if (!methodGuard(req, res, "POST")) return;
  const body = await readJsonBody(req);
  const { vehicleName, vehicleType, vehicleNumber, description, imageUrl } = body;
  const seatingCapacity = toNumber(body.seatingCapacity, 0);
  const features = Array.isArray(body.features) ? body.features : [];

  if (!vehicleName || !vehicleType) return sendJson(res, 400, { error: "vehicleName and vehicleType are required." });
  if (seatingCapacity < 1) return sendJson(res, 400, { error: "seatingCapacity must be at least 1." });

  const vehicle = await prisma.vehicle.create({
    data: {
      vehicleName,
      vehicleType,
      vehicleNumber: vehicleNumber || null,
      seatingCapacity,
      description: description || null,
      features,
      imageUrl: imageUrl || null,
      status: body.status || "AVAILABLE",
      bookingEnabled: body.bookingEnabled !== undefined ? Boolean(body.bookingEnabled) : true,
      recommended: Boolean(body.recommended),
    },
  });

  await addAuditLog({ adminId: session.adminId, actionType: "VEHICLE_CREATED", entityType: "Vehicle", entityId: vehicle.id, oldValue: null, newValue: vehicle });

  sendJson(res, 201, { success: true, vehicle });
}));
