/**
 * lib/audit.js
 * Permanent admin activity log (Part 2.11). Called from every
 * admin-triggered state change — never skip this for financial or
 * assignment actions.
 */
const { prisma } = require("./db");

async function addAuditLog({ adminId, actionType, entityType, entityId, oldValue, newValue }, tx = prisma) {
  return tx.auditLog.create({
    data: {
      adminId: adminId || "unknown",
      actionType,
      entityType,
      entityId,
      oldValue: oldValue === undefined ? undefined : safeJson(oldValue),
      newValue: newValue === undefined ? undefined : safeJson(newValue),
    },
  });
}

function safeJson(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    return { note: "unserializable value" };
  }
}

module.exports = { addAuditLog };
