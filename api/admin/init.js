/**
 * POST /api/admin/init
 *
 * Creates the first owner/admin account using environment variables.
 * Required:
 *   ADMIN_USERNAME
 *   ADMIN_PASSWORD
 *   ADMIN_SESSION_SECRET
 *
 * Optional:
 *   ADMIN_NAME
 *
 * This endpoint only creates an admin when no AdminUser exists.
 * It requires ADMIN_SESSION_SECRET as a Bearer token.
 */

const { prisma } = require("../../lib/db");
const { hashPassword } = require("../../lib/auth");
const {
  sendJson,
  methodGuard,
  withErrorHandling,
} = require("../../lib/apiUtils");

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, "POST")) return;

  // Check whether an admin already exists
  const existingCount = await prisma.adminUser.count();

  if (existingCount > 0) {
    return sendJson(res, 403, {
      error:
        "An admin account already exists. Use /api/admin/create-admin while logged in to add more.",
    });
  }

  // Verify bootstrap secret
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ")
    ? auth.slice(7)
    : null;

  if (
    !bearer ||
    !process.env.ADMIN_SESSION_SECRET ||
    bearer !== process.env.ADMIN_SESSION_SECRET
  ) {
    return sendJson(res, 403, {
      error: "Unauthorized bootstrap attempt.",
    });
  }

  // Read owner credentials from environment variables
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const name =
    process.env.ADMIN_NAME || "Prakash Tour & Travels Owner";

  // Validate environment variables
  if (!username || !password) {
    return sendJson(res, 500, {
      error:
        "ADMIN_USERNAME and ADMIN_PASSWORD must be configured in environment variables.",
    });
  }

  if (password.length < 10) {
    return sendJson(res, 500, {
      error:
        "ADMIN_PASSWORD must contain at least 10 characters.",
    });
  }

  // Create owner/admin
  const passwordHash = await hashPassword(password);

  const admin = await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      name,
    },
  });

  return sendJson(res, 201, {
    success: true,
    message: "Owner account created successfully.",
    admin: {
      username: admin.username,
      name: admin.name,
    },
  });
});
