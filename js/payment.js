/* ============================================================
   PAYMENT — secure token page (customer-facing)
   Loaded as payment.html?token=<secureToken>. All data and the
   amount due come from GET /api/payment/[token] (server-side
   validated, never from localStorage or the URL) — see
   api/payment/[token].js.
   ============================================================ */
let DB = loadDB();
let PAY_TOKEN = null;
let PAY_DATA = null; // { payment, upi, alreadyPaid }

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  PAY_TOKEN = params.get("token");
  loadPaymentPage();
});

async function loadPaymentPage() {
  const root = document.getElementById("payment-root");
  if (!PAY_TOKEN) {
    renderNotFound();
    return;
  }
  root.innerHTML = `<div class="container" style="max-width:520px;padding:140px 20px 80px;text-align:center;">Loading your payment details…</div>`;
  try {
    PAY_DATA = await api.getPaymentByToken(PAY_TOKEN);
    renderPaymentPage();
  } catch (err) {
    renderNotFound(err.message);
  }
}

function renderNotFound(message) {
  const root = document.getElementById("payment-root");
  root.innerHTML = `
    <div class="container" style="max-width:520px;padding:120px 20px 80px;text-align:center;">
      <h2>Payment link unavailable</h2>
      <p style="margin-top:10px;">${message || "This payment link is invalid or has expired. Please use the latest link shared with you, or contact us on WhatsApp."}</p>
      <a class="btn btn-primary" style="margin-top:20px;" href="${waLink(DB.settings.whatsapp, "Hi, I need help with my booking payment.")}" target="_blank" rel="noopener">${icon("message", 15)} WhatsApp Us</a>
      <div style="margin-top:14px;"><a href="index.html" class="btn btn-outline">Back to Home</a></div>
    </div>`;
}

function renderPaymentPage() {
  const root = document.getElementById("payment-root");
  const p = PAY_DATA.payment;
  const upi = PAY_DATA.upi;
  const amount = Number(p.amount);
  const stageLabel = p.paymentStage === "ADVANCE" ? "Advance Payment" : "Final Payment";

  if (PAY_DATA.alreadyPaid || p.status === "PAID") {
    root.innerHTML = `
      <div class="container" style="max-width:520px;padding:120px 20px 80px;text-align:center;">
        <h2 style="color:var(--success);">✅ Already Paid</h2>
        <p style="margin-top:10px;">This ${stageLabel.toLowerCase()} has already been completed for booking <b>${p.bookingId}</b>.</p>
        <a class="btn btn-primary" style="margin-top:20px;" href="booking-status.html?bookingId=${encodeURIComponent(p.bookingId)}">Check Booking Status</a>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="container" style="max-width:640px;padding:120px 20px 100px;">
      <a href="index.html" class="brand" style="color:var(--navy-900);font-size:20px;">${DB.settings.businessName.split(" ")[0]} <span style="color:var(--gold-600);">${DB.settings.businessName.split(" ").slice(1).join(" ")}</span></a>
      <div style="margin-top:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <h2 style="font-size:24px;">Booking #${p.bookingId}</h2>
        <span class="status">${stageLabel}</span>
      </div>
      <p style="color:var(--text-500);margin-top:6px;">${p.trip.pickupLocation} → ${p.trip.destination} · ${fmtDate(p.trip.travelDate)}</p>

      <div class="qr-card" style="margin-top:30px;">
        <div class="brand">${DB.settings.businessName}</div>
        <div class="loc">${DB.settings.address.split(",").slice(-2).join(",").trim()}</div>
        <div class="bookingref">Booking #${p.bookingId}</div>
        <div class="qr-box"><div id="qr-canvas"></div></div>
        <div class="qr-amount">${fmtCurrency(amount)}</div>
        <div class="qr-note">${stageLabel}</div>
        <div class="qr-upi">UPI: <b>${upi.upiId}</b></div>
        <p class="qr-note" style="margin-top:10px;">Scan &amp; Pay using any UPI App</p>
      </div>

      <div class="admin-panel-card" style="margin-top:22px;">
        <h3>Amount Due</h3>
        <div class="kv-row"><span>${stageLabel}</span><b>${fmtCurrency(amount)}</b></div>
      </div>

      <div class="admin-panel-card" id="gateway-card" style="display:none;">
        <h3>Option 1 — Pay Online (Instant Verification)</h3>
        <p style="font-size:13px;">Pay securely via card, UPI, netbanking or wallet. Verified instantly.</p>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="payOnline()">Pay Online Now</button>
        </div>
        <div id="online-pay-status" style="margin-top:10px;font-size:13px;"></div>
      </div>

      <div class="admin-panel-card">
        <h3>Option ${amount ? "2" : "1"} — Pay via UPI &amp; Upload Receipt</h3>
        <p style="font-size:13px;">Scan the QR above, pay ${fmtCurrency(amount)}, then upload your payment screenshot or receipt for verification.</p>
        <div class="field full" style="margin-top:12px;">
          <label>Transaction / UTR Reference (optional)</label>
          <input type="text" id="txn-ref-input" placeholder="e.g. UPI reference number">
        </div>
        <div class="field full" style="margin-top:12px;">
          <label>${icon("upload", 13)} Upload Receipt (JPG, PNG, WEBP or PDF)</label>
          <input type="file" id="receipt-input" accept=".jpg,.jpeg,.png,.webp,.pdf" onchange="handleReceiptUpload(event)">
        </div>
        <div id="receipt-status" style="margin-top:10px;font-size:13px;"></div>
      </div>

      <div style="margin-top:26px;">
        <a href="booking-status.html?bookingId=${encodeURIComponent(p.bookingId)}" style="font-size:13px;color:var(--text-500);">&larr; Back to Booking Status</a>
      </div>
    </div>`;

  renderQR(p, amount, upi);
  checkGatewayAvailability();
}

/* ---- QR generation (real dynamic UPI QR via CDN qrcode lib) ---- */
function renderQR(payment, amount, upi) {
  const upiUri = buildUpiUri(upi.upiId, upi.upiDisplayName, amount, payment.bookingId);
  const target = document.getElementById("qr-canvas");
  target.innerHTML = "";
  try {
    // eslint-disable-next-line no-undef
    new QRCode(target, { text: upiUri, width: 190, height: 190, colorDark: "#0f172a", colorLight: "#ffffff" });
  } catch (e) {
    console.error("QR generation failed", e);
    target.innerHTML = `<div style="width:190px;height:190px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;padding:10px;">
      QR could not be generated. Please pay manually to UPI ID <b>${upi.upiId}</b> and upload your receipt below.</div>`;
  }
}

function buildUpiUri(upiId, name, amount, ref) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: String(Math.max(Number(amount) || 0, 1)),
    cu: "INR",
    tn: `Booking ${ref}`,
    tr: ref,
  });
  return `upi://pay?${params.toString()}`;
}

/* ---- Option 1: real Razorpay checkout, only shown if the gateway is configured server-side ---- */
async function checkGatewayAvailability() {
  try {
    const order = await api.createGatewayOrder(PAY_TOKEN);
    // Gateway is configured — stash the order and reveal the button.
    window.__rzpOrder = order;
    const card = document.getElementById("gateway-card");
    if (card) card.style.display = "";
  } catch (e) {
    // 501 = not configured; leave the manual-UPI option as the only path.
  }
}

async function payOnline() {
  const statusEl = document.getElementById("online-pay-status");
  if (!window.__rzpOrder || typeof Razorpay === "undefined") {
    statusEl.innerHTML = `<span style="color:var(--danger);">Online payment isn't available right now. Please use the UPI option below.</span>`;
    return;
  }
  const order = window.__rzpOrder;
  const rzp = new Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: DB.settings.businessName,
    description: `Booking ${PAY_DATA.payment.bookingId}`,
    order_id: order.orderId,
    handler: async function (response) {
      statusEl.textContent = "Verifying payment…";
      try {
        const result = await api.verifyGatewayPayment({
          token: PAY_TOKEN,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
        statusEl.innerHTML = `<span style="color:var(--success);font-weight:700;">Payment verified. Redirecting…</span>`;
        setTimeout(() => (location.href = `booking-status.html?bookingId=${encodeURIComponent(result.booking.bookingId)}`), 1200);
      } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--danger);">${err.message || "Verification failed. If money was deducted, please contact us."}</span>`;
      }
    },
    theme: { color: "#0f172a" },
  });
  rzp.open();
}

/* ---- Option 2: manual UPI + real receipt upload to the server ---- */
async function handleReceiptUpload(e) {
  const file = e.target.files[0];
  const statusEl = document.getElementById("receipt-status");
  if (!file) return;
  const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) {
    statusEl.innerHTML = `<span style="color:var(--danger);">Please upload a JPG, PNG, WEBP or PDF file.</span>`;
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    statusEl.innerHTML = `<span style="color:var(--danger);">File is too large. Maximum size is 8 MB.</span>`;
    return;
  }

  statusEl.textContent = "Uploading…";
  const formData = new FormData();
  formData.append("token", PAY_TOKEN);
  formData.append("receipt", file);
  const txnRef = document.getElementById("txn-ref-input");
  if (txnRef && txnRef.value.trim()) formData.append("transactionReference", txnRef.value.trim());

  try {
    await api.submitReceipt(formData);
    statusEl.innerHTML = `<span style="color:var(--success);font-weight:700;">${icon("check", 14)} Receipt uploaded. Status: Under Verification.</span>`;
    setTimeout(() => (location.href = `booking-status.html?bookingId=${encodeURIComponent(PAY_DATA.payment.bookingId)}`), 1200);
  } catch (err) {
    statusEl.innerHTML = `<span style="color:var(--danger);">${err.message || "Upload failed. Please try again or send the receipt on WhatsApp."}</span>`;
  }
}
