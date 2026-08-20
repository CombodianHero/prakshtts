/* ============================================================
   INVOICE — secure view & print (A4-friendly, matches site theme)
   Invoices are generated server-side by an admin only after
   outstandingBalance = 0 (see api/admin/generate-invoice.js).
   This page fetches the invoice via the same secure Booking ID +
   registered-email match as booking-status (api/invoices/lookup.js)
   — never by Booking ID alone.
   ============================================================ */
let DB = loadDB();

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const bookingId = params.get("bookingId") || params.get("booking") || "";
  renderEmailGate(bookingId);
});

function renderEmailGate(bookingId, errorMsg) {
  const root = document.getElementById("invoice-root");
  root.innerHTML = `
    <div class="container" style="max-width:480px;padding:120px 20px 80px;">
      <h2>View Your Invoice</h2>
      <p style="margin-top:8px;font-size:13px;color:var(--text-500);">Enter your Booking ID and registered email to securely view your invoice.</p>
      <form id="invoice-gate-form" class="form-card" style="margin-top:20px;" onsubmit="handleInvoiceLookup(event)">
        <div class="field full" style="margin-bottom:12px;">
          <label>Booking ID</label>
          <input id="inv-bookingId" value="${bookingId || ""}" placeholder="TRV-2026-00001" required>
        </div>
        <div class="field full" style="margin-bottom:14px;">
          <label>Registered Email Address</label>
          <input id="inv-email" type="email" placeholder="you@email.com" required>
        </div>
        ${errorMsg ? `<div style="background:var(--danger-bg);color:var(--danger);border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px;">${errorMsg}</div>` : ""}
        <button class="btn btn-primary btn-block" type="submit" id="inv-submit-btn">View Invoice</button>
      </form>
    </div>`;
}

async function handleInvoiceLookup(e) {
  e.preventDefault();
  const bookingId = document.getElementById("inv-bookingId").value.trim();
  const email = document.getElementById("inv-email").value.trim().toLowerCase();
  const btn = document.getElementById("inv-submit-btn");
  btn.disabled = true;
  btn.textContent = "Loading…";
  try {
    const result = await api.invoiceLookup(bookingId, email);
    renderInvoice(result.invoice);
  } catch (err) {
    renderEmailGate(bookingId, err.message || "Could not load invoice. Please check your details and try again.");
  }
}

function renderInvoice(inv) {
  const root = document.getElementById("invoice-root");
  const totalPayable = Number(inv.baseAmount) + Number(inv.additionalChargesTotal);

  root.innerHTML = `
    <div class="container no-print" style="padding:110px 0 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <a href="booking-status.html?bookingId=${encodeURIComponent(inv.bookingId)}" class="btn btn-outline btn-sm">${icon("chevronRight", 14)} Back to Status</a>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-outline btn-sm" onclick="window.print()">${icon("print", 14)} Print / Save PDF</button>
      </div>
    </div>
    <div class="container" style="padding:26px 0 80px;">
      <div class="invoice-sheet" id="invoice-sheet">
        <div class="invoice-head">
          <div>
            <h2>${DB.settings.businessName}</h2>
            <p style="font-size:13px;margin-top:4px;">${DB.settings.address}</p>
            <p style="font-size:13px;">Contact: ${DB.settings.phone}</p>
          </div>
          <div class="meta">
            <p><b>Invoice #:</b> ${inv.invoiceNumber}</p>
            <p><b>Booking #:</b> ${inv.bookingId}</p>
            <p><b>Invoice Date:</b> ${fmtDate(inv.generatedAt)}</p>
          </div>
        </div>

        <div class="invoice-grid">
          <div>
            <h4>Customer Details</h4>
            <p style="font-size:13px;">${inv.customerName}</p>
            <p style="font-size:13px;">${inv.customerPhone}</p>
            <p style="font-size:13px;">${inv.customerEmail || "—"}</p>
          </div>
          <div>
            <h4>Travel Details</h4>
            <p style="font-size:13px;">Pickup: ${inv.pickupLocation}</p>
            <p style="font-size:13px;">Destination: ${inv.destination}</p>
            <p style="font-size:13px;">Travel Date: ${fmtDate(inv.travelDate)}</p>
          </div>
        </div>

        <h4 style="font-size:12px;text-transform:uppercase;color:var(--text-500);">Fare Details</h4>
        <table class="invoice-table">
          <thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead>
          <tbody>
            <tr><td>Base Booking Amount</td><td style="text-align:right;">${fmtCurrency(inv.baseAmount)}</td></tr>
            ${inv.charges.map((c) => `<tr><td>${c.chargeType === "OTHER" ? c.description || "Other Charge" : c.chargeType[0] + c.chargeType.slice(1).toLowerCase()}</td><td style="text-align:right;">${fmtCurrency(c.amount)}</td></tr>`).join("")}
            <tr class="invoice-total-row"><td>Total Payable</td><td style="text-align:right;">${fmtCurrency(totalPayable)}</td></tr>
            <tr><td>Advance Paid</td><td style="text-align:right;">${fmtCurrency(inv.advancePaidAmount)}</td></tr>
            <tr><td>Total Paid</td><td style="text-align:right;">${fmtCurrency(inv.totalPaidAmount)}</td></tr>
            <tr><td><b>Outstanding Balance</b></td><td style="text-align:right;"><b>${fmtCurrency(inv.outstandingBalance)}</b></td></tr>
          </tbody>
        </table>

        <div class="invoice-grid" style="margin-top:24px;">
          <div>
            <h4>Status</h4>
            <p style="font-size:13px;">Payment Status: <span class="status status-FULLY_PAID">FULLY PAID</span></p>
          </div>
        </div>

        <p class="invoice-note">${DB.settings.terms}<br>${DB.settings.cancellationPolicy}</p>

        <div class="invoice-sign"><div>Authorized Signature</div></div>
      </div>
    </div>`;
}
