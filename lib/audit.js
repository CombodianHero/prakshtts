/**
 * lib/audit.js
 *
 * Admin audit logging.
 *
 * Supports:
 *
 * Normal query:
 * await addAuditLog(data);
 *
 * Inside transaction:
 * await addAuditLog(data, tx);
 */

const { prisma } = require("./db");


/**
 * Create an audit log entry.
 *
 * @param {object} data
 * @param {string|null} data.adminId
 * @param {string} data.actionType
 * @param {string} data.entityType
 * @param {string} data.entityId
 * @param {object|null} data.oldValue
 * @param {object|null} data.newValue
 *
 * @param {object|null} tx Prisma transaction client
 */
async function addAuditLog(
  data,
  tx = null
) {
  // ============================================================
  // IMPORTANT TRANSACTION FIX
  // ============================================================

  const db =
    tx || prisma;


  if (!data) {
    throw new Error(
      "Audit log data is required."
    );
  }


  const {
    adminId = null,
    actionType,
    entityType,
    entityId,
    oldValue = null,
    newValue = null,
  } = data;


  if (!actionType) {
    throw new Error(
      "actionType is required for audit logging."
    );
  }


  if (!entityType) {
    throw new Error(
      "entityType is required for audit logging."
    );
  }


  if (!entityId) {
    throw new Error(
      "entityId is required for audit logging."
    );
  }


  // ============================================================
  // CREATE AUDIT LOG
  //
  // IMPORTANT:
  // `auditLog` must match your Prisma model name.
  // ============================================================

  return db.auditLog.create({
    data: {
      adminId,

      actionType,

      entityType,

      entityId,

      oldValue,

      newValue,
    },
  });
}


module.exports = {
  addAuditLog,
};
