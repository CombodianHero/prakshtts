/* ============================================================
   BOOKING STATUS — secure Booking ID + email lookup.
   Talks to POST /api/booking-status (see api/booking-status.js),
   which enforces an exact bookingId + registered-email match
   server-side and returns only a customer-safe DTO (lib/dto.js).
   ============================================================ */

let DB = loadDB();
let attemptCount = 0;
const MAX_ATTEMPTS = 5;
let lastLookupEmail = "";

document.addEventListener("DOMContentLoaded", () => {
  renderHeaderFooter();
  const params = new URLSearchParams(location.search);
  renderForm(params.get("bookingId") || "");
});

/* ---------------- HEADER / FOOTER (matches site theme) ---------------- */
function renderHeaderFooter() {
  document.getElementById("site-header").innerHTML = `
    <div class="container row">
      <a href="index.html" class="brand">${DB.settings.businessName.split(" ")[0]} <span>${DB.settings.businessName.split(" ").slice(1).join(" ")}</span></a>
      <nav class="nav-desktop">
        <a href="index.html#destinations">Destinations</a>
        <a href="index.html#fleet">Our Cars</a>
        <a href="index.html#tours">Tours</a>
        <a href="index.html#services">Services</a>
        <a href="booking-status.html" style="color:var(--gold-400);">Check Booking Status</a>
        <a href="index.html#contact">Contact</a>
      </nav>
      <div class="header-actions">
        <a class="wa-link" target="_blank" rel="noopener" href="${waLink(DB.settings.whatsapp, "Hi, I need help with my booking.")}">${icon("message", 17)} WhatsApp</a>
        <a class="btn btn-primary btn-sm" href="index.html#fleet">Book Now</a>
      </div>
      <div class="header-mobile-actions">
        <button class="hamburger" onclick="toggleMobileMenu(true)">${icon("menu", 26)}</button>
      </div>
    </div>`;

  document.getElementById("mobile-menu").innerHTML = `
    <div class="backdrop" onclick="toggleMobileMenu(false)"></div>
    <div class="panel">
      <div class="close-row">
        <span class="brand" style="font-size:18px;">Menu</span>
        <button class="hamburger" onclick="toggleMobileMenu(false)">${icon("x", 22)}</button>
      </div>
      <a href="index.html">Home</a>
      <a href="index.html#fleet">Our Cars</a>
      <a href="booking-status.html" style="color:var(--gold-400);">Check Booking Status</a>
      <a href="index.html#contact">Contact</a>
    </div>`;

  document.getElementById("site-footer").innerHTML = `
    <div class="container" style="padding:0 20px;">
      <p style="font-size:13px;color:rgba(255,255,255,.6);">${DB.settings.businessName} · ${DB.settings.address}</p>
      <p style="font-size:13px;color:rgba(255,255,255,.6);margin-top:6px;">${DB.settings.phone} · <a href="index.html">Back to Home</a></p>
    </div>`;

  document.getElementById("mobile-bar").innerHTML = `
    <a href="tel:${DB.settings.phone}">${icon("phone", 18)} Call</a>
    <a class="wa" href="${waLink(DB.settings.whatsapp, "Hi, I need help with my booking.")}" target="_blank" rel="noopener">${icon("message", 18)} WhatsApp</a>
    <a href="index.html#fleet">${icon("car", 18)} Book</a>`;
}
function toggleMobileMenu(open) {
  document.getElementById("mobile-menu").classList.toggle("open", open);
}

/* ---------------- FORM / INITIAL STATE ---------------- */
function renderForm(prefillBookingId, errorMsg) {
  const root = document.getElementById("status-root");
  root.innerHTML = `
    <div class="container" style="max-width:520px;padding-bottom:100px;">
      <div class="eyebrow"><span class="line"></span><span>Booking Status</span></div>
      <h1 style="font-size:30px;">Check Your Booking Status</h1>
      <p style="margin-top:10px;">Enter your Booking ID and the email address you used when booking to securely view your status.</p>

      <form id="status-form" class="form-card" style="margin-top:24px;" onsubmit="handleCheckStatus(event)">
        <div class="field full" style="margin-bottom:14px;">
          <label>Booking ID</label>
          <input id="lookup-bookingId" name="bookingId" placeholder="TRV-2026-00001" value="${prefillBookingId || ""}" required>
        </div>
        <div class="field full" style="margin-bottom:16px;">
          <label>Registered Email Address</label>
          <input id="lookup-email" name="email" type="email" placeholder="you@email.com" required>
        </div>
        ${errorMsg ? `<div style="background:var(--danger-bg);color:var(--danger);border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px;">${errorMsg}</div>` : ""}
        <button class="btn btn-primary btn-block" type="submit" id="status-submit-btn">Check Status</button>
      </form>

      <div class="admin-panel-card" style="margin-top:22px;">
        <h3 style="font-size:14px;">Need Help?</h3>
        <div class="modal-actions">
          <a class="btn btn-outline btn-sm" href="tel:${DB.settings.phone}">${icon("phone", 14)} Call Support</a>
          <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${waLink(DB.settings.whatsapp, "Hi, I need help checking my booking status.")}">${icon("message", 14)} WhatsApp Support</a>
          <a class="btn btn-outline btn-sm" href="mailto:${DB.settings.email}">${icon("mail", 14)} Email Support</a>
        </div>
      </div>
    </div>`;
}

/* ---------------- LOOKUP ---------------- */
async function handleCheckStatus(e) {
  e.preventDefault();
  if (attemptCount >= MAX_ATTEMPTS) {
    renderForm(
      document.getElementById("lookup-bookingId").value,
      "Too many attempts. Please wait a moment and try again, or contact us directly for help."
    );
    return;
  }

  const bookingId = document.getElementById("lookup-bookingId").value.trim();
  const email = document.getElementById("lookup-email").value.trim().toLowerCase();
  const btn = document.getElementById("status-submit-btn");
  btn.disabled = true;
  btn.textContent = "Checking…";
  attemptCount += 1;

  try {
    const result = await api.bookingStatus(bookingId, email);
    attemptCount = 0;
    lastLookupEmail = email;
    renderBookingStatus(result.booking);
  } catch (err) {
    renderForm(bookingId, err.message || "Unable to check booking status right now. Please try again later.");
  }
}

/* ---------------- STATUS MAPPING ---------------- */
const BOOKING_STATUS_LABELS = {
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};
const PAYMENT_STATUS_LABELS = {
  NO_PAYMENT_REQUIRED_YET: "No Payment Required Yet",
  ADVANCE_PAYMENT_REQUIRED: "Advance Payment Required",
  ADVANCE_PAYMENT_PENDING: "Advance Payment Pending",
  ADVANCE_PAYMENT_UNDER_VERIFICATION: "Advance Payment Under Verification",
  ADVANCE_PAYMENT_REJECTED: "Advance Payment Rejected",
  ADVANCE_PAID: "Advance Paid",
  FINAL_PAYMENT_REQUIRED: "Final Payment Required",
  FINAL_PAYMENT_PENDING: "Final Payment Pending",
  FINAL_PAYMENT_UNDER_VERIFICATION: "Final Payment Under Verification",
  FINAL_PAYMENT_REJECTED: "Final Payment Rejected",
  FULLY_PAID: "Fully Paid",
};
const TRIP_STATUS_LABELS = {
  NOT_ASSIGNED: "Not Yet Assigned",
  VEHICLE_ASSIGNED: "Vehicle Assigned",
  UPCOMING: "Upcoming",
  ON_TRIP: "On Trip",
  TRAVEL_COMPLETED: "Travel Completed",
};

/* ---------------- DYNAMIC TIMELINE (from real DB events) ---------------- */
function timelineHtml(events) {
  if (!events || !events.length) {
    return `<p style="font-size:13px;color:var(--text-500);">No timeline events yet.</p>`;
  }
  const dot = `<span style="color:var(--success);">${icon("check", 16)}</span>`;
  return `<div>${events
    .map(
      (ev, i) => `
    <div style="display:flex;gap:14px;">
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:26px;height:26px;border-radius:50%;background:var(--success-bg);display:flex;align-items:center;justify-content:center;">${dot}</div>
        ${i < events.length - 1 ? `<div style="width:2px;flex:1;min-height:22px;background:var(--success);"></div>` : ""}
      </div>
      <div style="padding-bottom:22px;">
        <p style="font-size:14px;font-weight:500;color:var(--text-900);">${ev.title}</p>
        ${ev.description ? `<p style="font-size:12px;color:var(--text-500);margin-top:2px;">${ev.description}</p>` : ""}
        <p style="font-size:11px;color:var(--text-500);margin-top:2px;">${fmtDate(ev.at)}</p>
      </div>
    </div>`
    )
    .join("")}</div>`;
}

/* ---------------- MAIN STATUS VIEW ---------------- */
function renderBookingStatus(b) {
  const bookingStatusLabel = BOOKING_STATUS_LABELS[b.bookingStatus] || b.bookingStatus;
  const paymentStatusLabel = PAYMENT_STATUS_LABELS[b.paymentStatus] || b.paymentStatus;
  const tripStatusLabel = TRIP_STATUS_LABELS[b.tripStatus] || b.tripStatus;

  document.getElementById("status-root").innerHTML = `
    <div class="container" style="max-width:640px;padding-bottom:100px;">
      <a href="#" onclick="renderForm('');return false;" class="link-btn" style="margin-bottom:12px;display:inline-block;">&larr; Check another booking</a>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <div class="eyebrow"><span class="line"></span><span>Booking Status</span></div>
          <h1 style="font-size:26px;">${b.bookingId}</h1>
        </div>
        <span class="status status-${b.bookingStatus}" style="font-size:13px;padding:8px 16px;">${bookingStatusLabel}</span>
      </div>

      ${renderActionBanner(b)}

      <div class="admin-panel-card" style="margin-top:18px;">
        <h3>Status Overview</h3>
        <div class="kv-row"><span>Booking Status</span><b>${bookingStatusLabel}</b></div>
        <div class="kv-row"><span>Payment Status</span><b>${paymentStatusLabel}</b></div>
        <div class="kv-row"><span>Trip Status</span><b>${tripStatusLabel}</b></div>
      </div>

      <div class="admin-panel-card">
        <h3>Trip Details</h3>
        <div class="kv-row"><span>Booking Date</span><b>${fmtDate(b.createdAt)}</b></div>
        <div class="kv-row"><span>Pickup</span><b>${b.trip.pickupLocation}</b></div>
        <div class="kv-row"><span>Destination</span><b>${b.trip.destination}</b></div>
        <div class="kv-row"><span>Travel Date</span><b>${fmtDate(b.trip.travelDate)}${b.trip.returnDate ? " → " + fmtDate(b.trip.returnDate) : ""}</b></div>
        <div class="kv-row"><span>Trip Type</span><b>${b.trip.tripType || "—"}</b></div>
        <div class="kv-row"><span>Passengers</span><b>${b.trip.passengerCount || "—"}</b></div>
        <div class="kv-row"><span>Requested Vehicle</span><b>${b.trip.requestedVehicleName || "Not specified"}</b></div>
      </div>

      ${renderPaymentSummary(b)}
      ${renderVehicleDriverPanel(b)}
      ${renderQueryPanel(b)}

      <div class="admin-panel-card">
        <h3>Booking Timeline</h3>
        ${timelineHtml(b.timeline)}
      </div>

      <div class="admin-panel-card">
        <h3 style="font-size:14px;">Need Help?</h3>
        <div class="modal-actions">
          <a class="btn btn-outline btn-sm" href="tel:${DB.settings.phone}">${icon("phone", 14)} Call Support</a>
          <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${waLink(DB.settings.whatsapp, `Hi, I have a question about booking ${b.bookingId}.`)}">${icon("message", 14)} WhatsApp Support</a>
          <a class="btn btn-outline btn-sm" href="mailto:${DB.settings.email}">${icon("mail", 14)} Email Support</a>
        </div>
      </div>
    </div>`;
}

/* Prominent "what do I need to do right now" banner */
function renderActionBanner(b) {
  if (b.bookingStatus === "CANCELLED" || b.bookingStatus === "REJECTED") {
    return `<div class="admin-panel-card" style="margin-top:18px;border-color:var(--danger);background:var(--danger-bg);">
      <h3 style="color:var(--danger);">Booking ${b.bookingStatus === "CANCELLED" ? "Cancelled" : "Rejected"}</h3>
      <p style="font-size:13px;">This booking is no longer active. Contact us if you believe this is a mistake.</p>
    </div>`;
  }
  if (b.bookingStatus === "PENDING_APPROVAL") {
    return `<div class="admin-panel-card" style="margin-top:18px;">
      <h3>Booking Request Received</h3>
      <p style="font-size:13px;">Your booking request has been received and is currently under review. We'll notify you as soon as it's approved — no action is needed from you right now.</p>
    </div>`;
  }
  if (b.paymentStatus === "ADVANCE_PAYMENT_REQUIRED" || b.paymentStatus === "FINAL_PAYMENT_REQUIRED") {
    const isAdvance = b.paymentStatus === "ADVANCE_PAYMENT_REQUIRED";
    const payUrl = b.activePaymentRequest ? `payment.html?token=${encodeURIComponent(b.activePaymentRequest.secureToken)}` : null;
    return `<div class="admin-panel-card" style="margin-top:18px;border-color:var(--gold-500);background:var(--gold-50);">
      <h3 style="color:var(--gold-600);">Action Required: Pay ${isAdvance ? "Advance" : "Final Amount"}</h3>
      <p style="font-size:13px;">${isAdvance ? "Your booking has been approved. Please complete the advance payment to confirm your vehicle." : "Please review and pay the final amount to complete your booking."}</p>
      ${payUrl ? `<a class="btn btn-primary" style="margin-top:12px;" href="${payUrl}">Pay Now</a>` : `<p style="font-size:12px;color:var(--text-500);margin-top:8px;">Please contact us for your payment link.</p>`}
    </div>`;
  }
  if (b.paymentStatus === "ADVANCE_PAYMENT_UNDER_VERIFICATION" || b.paymentStatus === "FINAL_PAYMENT_UNDER_VERIFICATION") {
    return `<div class="admin-panel-card" style="margin-top:18px;background:var(--info-bg);border-color:var(--info);">
      <h3 style="color:var(--info);">Payment Under Verification</h3>
      <p style="font-size:13px;">Your payment proof has been submitted successfully and is currently being verified. We'll email you once it's confirmed.</p>
    </div>`;
  }
  if (b.paymentStatus === "ADVANCE_PAYMENT_REJECTED" || b.paymentStatus === "FINAL_PAYMENT_REJECTED") {
    const payUrl = b.activePaymentRequest ? `payment.html?token=${encodeURIComponent(b.activePaymentRequest.secureToken)}` : null;
    return `<div class="admin-panel-card" style="margin-top:18px;border-color:var(--danger);background:var(--danger-bg);">
      <h3 style="color:var(--danger);">Action Required: Payment Verification Failed</h3>
      <p style="font-size:13px;">We couldn't verify your last payment submission. Please review and resubmit.</p>
      ${payUrl ? `<a class="btn btn-primary" style="margin-top:12px;" href="${payUrl}">Resubmit Payment</a>` : ""}
    </div>`;
  }
  if (b.paymentStatus === "FULLY_PAID") {
    return `<div class="admin-panel-card" style="margin-top:18px;border-color:var(--success);background:var(--success-bg);">
      <h3 style="color:var(--success);">✅ Fully Paid</h3>
      <p style="font-size:13px;">Your payment has been verified. ${b.invoice ? "Your invoice is ready below." : "Your invoice will be available shortly."}</p>
    </div>`;
  }
  return "";
}

function renderPaymentSummary(b) {
  const p = b.payment;
  if (!p || !p.baseAmount) return "";
  const chargeRows = (b.charges || [])
    .map((c) => row(c.chargeType === "OTHER" ? c.description || "Other Charge" : c.chargeType[0] + c.chargeType.slice(1).toLowerCase(), fmtCurrency(c.amount)))
    .join("");
  return `<div class="admin-panel-card">
    <h3>Payment Summary</h3>
    <div class="kv-row"><span>Base Booking Amount</span><b>${fmtCurrency(p.baseAmount)}</b></div>
    <div class="kv-row"><span>Advance Required</span><b>${fmtCurrency(p.advanceRequiredAmount)}</b></div>
    <div class="kv-row"><span>Advance Paid</span><b>${fmtCurrency(p.advancePaidAmount)}</b></div>
    <div class="kv-row"><span>Remaining Base Amount</span><b>${fmtCurrency(p.remainingBaseAmount)}</b></div>
    ${chargeRows}
    ${p.additionalChargesTotal ? row("Additional Charges Total", fmtCurrency(p.additionalChargesTotal)) : ""}
    <div class="kv-row"><span>Total Paid</span><b>${fmtCurrency(p.totalPaidAmount)}</b></div>
    <div class="kv-row"><span>Outstanding Balance</span><b>${fmtCurrency(p.outstandingBalance)}</b></div>
    ${
      b.paymentStatus === "FULLY_PAID" && b.invoice
        ? `<div class="modal-actions"><a class="btn btn-primary btn-sm" href="invoice.html?bookingId=${encodeURIComponent(b.bookingId)}" target="_blank">${icon("file", 14)} View / Download Final Invoice</a></div>
           <p style="font-size:11px;color:var(--text-500);margin-top:6px;">Invoice ${b.invoice.invoiceNumber}</p>`
        : b.paymentStatus === "FULLY_PAID"
        ? `<p style="font-size:12px;color:var(--text-500);margin-top:8px;">Your invoice is being prepared and will be available shortly.</p>`
        : b.paymentStatus === "ADVANCE_PAID"
        ? `<p style="font-size:12px;color:var(--text-500);margin-top:8px;">This is not a final invoice — the final amount will include any toll, parking, or other charges added after your trip.</p>`
        : ""
    }
  </div>`;
}
function row(label, value) {
  return `<div class="kv-row"><span>${label}</span><b>${value}</b></div>`;
}

function renderVehicleDriverPanel(b) {
  if (b.bookingStatus === "PENDING_APPROVAL" || b.bookingStatus === "APPROVED") return "";
  if (!b.vehicle && !b.driver) {
    return `<div class="admin-panel-card">
      <h3>🚗 Vehicle &amp; Driver</h3>
      <p style="font-size:13px;color:var(--text-500);">Your vehicle and driver details will be updated before your trip.</p>
    </div>`;
  }
  return `<div class="admin-panel-card">
    ${
      b.vehicle
        ? `<h3>🚗 Your Vehicle Details</h3>
    <div class="kv-row"><span>Vehicle</span><b>${b.vehicle.vehicleName}</b></div>
    <div class="kv-row"><span>Type</span><b>${b.vehicle.vehicleType}</b></div>
    ${b.vehicle.vehicleNumber ? `<div class="kv-row"><span>Vehicle Number</span><b>${b.vehicle.vehicleNumber}</b></div>` : ""}
    <div class="kv-row"><span>Seating Capacity</span><b>${b.vehicle.seatingCapacity}</b></div>`
        : ""
    }
    ${
      b.driver
        ? `<h3 style="margin-top:18px;">👨 Driver Details</h3>
    <div class="kv-row"><span>Driver Name</span><b>${b.driver.driverName}</b></div>
    <div class="kv-row"><span>Driver Phone</span><b>${b.driver.phone}</b></div>`
        : `<p style="font-size:12px;color:var(--text-500);margin-top:10px;">Driver details will be updated before your trip.</p>`
    }
  </div>`;
}

function renderQueryPanel(b) {
  if (!["FINAL_PAYMENT_REQUIRED", "FINAL_PAYMENT_UNDER_VERIFICATION", "FINAL_PAYMENT_REJECTED", "FULLY_PAID"].includes(b.paymentStatus)) return "";
  return `<div class="admin-panel-card">
    <h3>Have a Question About Your Final Amount?</h3>
    <form onsubmit="handleRaiseQuery(event, '${b.bookingId}')" style="margin-top:10px;">
      <textarea name="message" rows="3" placeholder="Describe your query…" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--stone-200);"></textarea>
      <button class="btn btn-outline btn-sm" type="submit" style="margin-top:8px;">Raise a Query</button>
      <span id="query-feedback" style="font-size:12px;margin-left:10px;"></span>
    </form>
  </div>`;
}

async function handleRaiseQuery(e, bookingId) {
  e.preventDefault();
  const form = e.target;
  const message = form.message.value.trim();
  const feedback = document.getElementById("query-feedback");
  if (!message) return;
  try {
    await api.raiseQuery({ bookingId, email: lastLookupEmail, message });
    feedback.textContent = "Submitted — we'll get back to you soon.";
    feedback.style.color = "var(--success)";
    form.reset();
  } catch (err) {
    feedback.textContent = err.message || "Could not submit your query.";
    feedback.style.color = "var(--danger)";
  }
}
