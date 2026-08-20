/**
 * lib/paymentUrl.js
 *
 * Central secure payment URL generator.
 *
 * This prevents these broken URLs:
 *
 * /payment/TOKEN
 * //payment.html
 * /payment.html?token=undefined
 * /payment.html?token=
 */


/**
 * Get and validate public application URL.
 */
function getAppUrl() {
  const appUrl =
    String(
      process.env.APP_URL || ""
    )
      .trim()
      .replace(/\/+$/, "");


  if (!appUrl) {
    throw Object.assign(
      new Error(
        "APP_URL environment variable is missing."
      ),
      {
        statusCode: 500,
      }
    );
  }


  // Basic safety check.

  if (
    !appUrl.startsWith("http://") &&
    !appUrl.startsWith("https://")
  ) {
    throw Object.assign(
      new Error(
        "APP_URL must start with http:// or https://"
      ),
      {
        statusCode: 500,
      }
    );
  }


  return appUrl;
}


/**
 * Create payment page URL from a secure token.
 *
 * @param {string} secureToken
 *
 * Example result:
 *
 * https://your-app.koyeb.app/payment.html?token=abc123
 */
function buildPaymentUrl(
  secureToken
) {
  const token =
    String(
      secureToken || ""
    ).trim();


  if (!token) {
    throw Object.assign(
      new Error(
        "Cannot create payment URL: secure payment token is missing."
      ),
      {
        statusCode: 500,
      }
    );
  }


  const appUrl =
    getAppUrl();


  return (
    `${appUrl}/payment.html?token=` +
    encodeURIComponent(token)
  );
}


module.exports = {
  getAppUrl,
  buildPaymentUrl,
};
