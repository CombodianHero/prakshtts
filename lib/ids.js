/**
 * lib/ids.js
 * Server-side, cryptographically-sound ID generation.
 * Never trust an ID sent from the browser as the real record ID.
 */
const crypto = require("crypto");

/**
 * Generates the next sequential booking ID for the given year, e.g. TRV-2026-00001.
 * Uses the DB unique constraint + retry-on-conflict as the real safety net (race
 * conditions between two simultaneous bookings are possible with a naive COUNT).
 */
async function generateBookingId(prisma) {
  const year = new Date().getFullYear();
  const prefix = `TRV-${year}-`;

  const count = await prisma.booking.count({
    where: { bookingId: { startsWith: prefix } },
  });

  let attempt = count + 1;
  for (let i = 0; i < 5; i++) {
    const candidate = `${prefix}${String(attempt).padStart(5, "0")}`;
    const exists = await prisma.booking.findUnique({ where: { bookingId: candidate } });
    if (!exists) return candidate;
    attempt += 1;
  }
  // Extremely unlikely fallback — still unique, still on-brand.
  return `${prefix}${String(attempt).padStart(5, "0")}-${crypto.randomBytes(2).toString("hex")}`;
}

/** Generates the next invoice number, e.g. PTT-INV-2026-00001. */
async function generateInvoiceNumber(prisma) {
  const year = new Date().getFullYear();
  const prefix = `PTT-INV-${year}-`;
  const count = await prisma.invoice.count({ where: { invoiceNumber: { startsWith: prefix } } });
  let attempt = count + 1;
  for (let i = 0; i < 5; i++) {
    const candidate = `${prefix}${String(attempt).padStart(5, "0")}`;
    const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
    if (!exists) return candidate;
    attempt += 1;
  }
  return `${prefix}${String(attempt).padStart(5, "0")}-${crypto.randomBytes(2).toString("hex")}`;
}

/** 256 bits of randomness, URL-safe — used as the secure payment token. */
function generateSecureToken() {
  return crypto.randomBytes(32).toString("base64url");
}

module.exports = { generateBookingId, generateInvoiceNumber, generateSecureToken };
