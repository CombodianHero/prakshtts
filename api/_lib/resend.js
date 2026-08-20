/**
 * api/_lib/resend.js
 * ------------------------------------------------------------
 * Thin wrapper around the real Resend SDK. This is the ONLY file
 * that touches RESEND_API_KEY — it never leaves the server.
 *
 * Requires the "resend" package (already in package.json).
 * Requires RESEND_API_KEY and EMAIL_FROM to be set as Vercel
 * environment variables (see .env.example / DEPLOYMENT.md).
 */
const { Resend } = require("resend");

let client = null;
function getClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it in Vercel → Settings → Environment Variables (see .env.example)."
    );
  }
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/**
 * Sends one transactional email via Resend.
 * @param {string} to - recipient email address
 * @param {string} subject
 * @param {string} html
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail(to, subject, html) {
  if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { success: false, error: "Invalid or missing recipient email address." };
  }
  const from = process.env.EMAIL_FROM || "Prakash Tour & Travels <onboarding@resend.dev>";

  try {
    const resend = getClient();
    const { data, error } = await resend.emails.send({ from, to: [to], subject, html });
    if (error) {
      return { success: false, error: typeof error === "string" ? error : error.message || "Resend API error" };
    }
    return { success: true, id: data && data.id ? data.id : null };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : "Unknown email sending error" };
  }
}

module.exports = { sendEmail };
