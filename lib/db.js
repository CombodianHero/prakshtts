/**
 * lib/db.js
 * Prisma client singleton — safe to import from any /api file.
 * Vercel serverless functions can spin up many isolated instances,
 * so we cache the client on `global` to avoid exhausting DB
 * connections during local dev hot-reloads.
 */
const { PrismaClient } = require("@prisma/client");

const globalForPrisma = global;

const prisma =
  globalForPrisma.__ptt_prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__ptt_prisma = prisma;
}

module.exports = { prisma };
