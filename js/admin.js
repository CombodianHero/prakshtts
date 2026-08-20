/* ============================================================
   PRAKASH TOUR & TRAVELS — OWNER CONTROL PANEL
   Real, server-side backed admin panel. Auth is a signed HTTP-only
   session cookie (lib/auth.js) — never a client-side flag. Every
   data view below is fetched live from the database via js/api.js;
   nothing business-critical is read from localStorage anymore.
   The only exception is destinations/tours/services, which remain
   static marketing content (see js/data.js) — not part of the
   spec's required database entities.
   ============================================================ */
let DB = loadDB();
const MANAGER_EDIT_ID = {};
let CURRENT_ADMIN = null;

document.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("hashchange", renderRoute);
  boot();
});

async function boot() {
  try {
    const me = await api.adminMe();
    CURRENT_ADMIN = me.username;
    renderShell();
    renderRoute();
  } catch (e) {
    renderLogin();
  }
}

function handleApiError(err) {
  if (err && err.status === 401) {
    CURRENT_ADMIN = null;
    renderLogin("Your session has expired. Please log in again.");
    return true;
  }
  return false;
}

/* ---------------- LOGIN ---------------- */
function renderLogin(notice) {
  document.getElementById("admin-root").innerHTML = `
    <div class="login-wrap">
      ${withFallbackAdmin(`<img src="${DB.destinations[0].img}" alt="">`)}
      <div class="login-card">
        <div class="brand-mark">${DB.settings.businessName.split(" ")[0]} <span>${DB.settings.businessName.split(" ").slice(1).join(" ")}</span></div>
        <div class="sub">Owner Control Panel</div>
        <form onsubmit="handleLogin(event)" style="display:flex;flex-direction:column;gap:14px;">
          <div class="field"><label>Username</label><input required id="login-user" autocomplete="username"></div>
          <div class="field"><label>Password</label><input required id="login-pass" type="password" autocomplete="current-password"></div>
          ${notice ? `<div style="color:var(--warning);font-size:13px;">${notice}</div>` : ""}
          <div id="login-error" style="color:var(--danger);font-size:13px;display:none;">Incorrect username or password.</div>
          <button class="btn btn-primary btn-block" type="submit" id="login-submit-btn">Log In</button>
        </form>
        <div style="text-align:center;margin-top:16px;"><a href="index.html" style="font-size:12px;color:var(--text-500);">&larr; Back to website</a></div>
      </div>
    </div>`;
}
async function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value;
  const btn = document.getElementById("login-submit-btn");
  const errEl = document.getElementById("login-error");
  errEl.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Logging in…";
  try {
    const result = await api.adminLogin(u, p);
    CURRENT_ADMIN = result.admin.username;
    location.hash = "#dashboard";
    renderShell();
    renderRoute();
  } catch (err) {
    errEl.textContent = err.message || "Incorrect username or password.";
    errEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Log In";
  }
}
async function logout() {
  try { await api.adminLogout(); } catch (e) { /* ignore */ }
  CURRENT_ADMIN = null;
  renderLogin();
}
function withFallbackAdmin(tag) {
  return tag.replace("<img ", `<img onerror="this.onerror=null;this.style.display='none';" `);
}

/* ---------------- SHELL (sidebar + topbar) ---------------- */
const NAV_ITEMS = [
  ["dashboard", "dashboard", "Dashboard"],
  ["bookings", "list", "Bookings"],
  ["vehicles", "car", "Fleet Vehicles"],
  ["drivers", "users", "Drivers"],
  ["queries", "message", "Customer Queries"],
  ["destinations", "pin", "Destinations"],
  ["tours", "compass", "Tour Packages"],
  ["services", "briefcase", "Services"],
  ["settings", "settings", "Settings"],
];

function renderShell() {
  document.getElementById("admin-root").innerHTML = `
    <div class="admin-body">
      <div class="admin-shell">
        <aside class="admin-sidebar" id="admin-sidebar">
          <div class="brand">${DB.settings.businessName.split(" ")[0]} <span style="color:var(--gold-400);">${DB.settings.businessName.split(" ").slice(1).join(" ")}</span>
            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;">Owner Control Panel</div>
          </div>
          <nav id="admin-nav"></nav>
          <div class="foot">
            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:8px;">Signed in as ${CURRENT_ADMIN || ""}</div>
            <button class="link-btn" style="color:var(--gold-400);display:flex;align-items:center;gap:6px;" onclick="logout()">${icon("logout", 14)} Log Out</button>
          </div>
        </aside>
        <div class="admin-main">
          <div class="admin-topbar">
            <div style="display:flex;align-items:center;gap:12px;">
              <button class="admin-menu-btn" onclick="toggleSidebar()">${icon("menu", 22)}</button>
              <h1 id="topbar-title">Dashboard</h1>
            </div>
            <a href="index.html" class="btn btn-outline btn-sm" target="_blank">View Website</a>
          </div>
          <div class="admin-content" id="admin-content"><p style="padding:20px;color:var(--text-500);">Loading…</p></div>
        </div>
      </div>
    </div>`;
  renderSidebarNav();
}
function toggleSidebar() {
  document.getElementById("admin-sidebar").classList.toggle("open");
}
function renderSidebarNav() {
  const route = currentRouteKey();
  document.getElementById("admin-nav").innerHTML = NAV_ITEMS.map(
    ([key, ic, label]) => `<a href="#${key}" class="${route === key ? "active" : ""}">${icon(ic, 16)} ${label}</a>`
  ).join("");
}

/* ---------------- ROUTER ---------------- */
function currentRouteKey() {
  return (location.hash.slice(1) || "dashboard").split("/")[0];
}
async function renderRoute() {
  if (!CURRENT_ADMIN) return;
  const hash = location.hash.slice(1) || "dashboard";
  const [key, arg] = hash.split("/");
  document.getElementById("admin-sidebar")?.classList.remove("open");
  renderSidebarNav();
  const titleMap = Object.fromEntries(NAV_ITEMS.map(([k, , l]) => [k, l]));
  document.getElementById("topbar-title").textContent = key === "bookings" && arg ? "Booking Detail" : (titleMap[key] || "Dashboard");

  try {
    switch (key) {
      case "dashboard": return await renderDashboard();
      case "bookings": return arg ? await renderBookingDetail(arg) : await renderBookingsList();
      case "vehicles": return await renderVehiclesManager();
      case "drivers": return await renderDriversManager();
      case "queries": return await renderQueriesManager();
      case "customers": return await renderCustomers();
      case "destinations": return renderDestinationsManager();
      case "tours": return renderToursManager();
      case "services": return renderServicesManager();
      case "settings": return renderSettings();
      default: return await renderDashboard();
    }
  } catch (err) {
    if (handleApiError(err)) return;
    document.getElementById("admin-content").innerHTML = `<div class="admin-panel-card"><p style="color:var(--danger);">${err.message || "Something went wrong."}</p></div>`;
  }
}

/* ---------------- DASHBOARD ---------------- */
async function renderDashboard() {
  const { stats } = await api.adminDashboard();
  const { bookings } = await api.adminBookingsList({ pageSize: 8 });
  const stat = (label, value, gold) => `<div class="stat-card ${gold ? "gold" : ""}"><div class="label">${label}</div><div class="value">${value}</div></div>`;

  document.getElementById("admin-content").innerHTML = `
    <div class="stat-grid">
      ${stat("Total Bookings", stats.totalBookings)}
      ${stat("Pending Approval", stats.pendingApproval)}
      ${stat("Approved", stats.approved)}
      ${stat("Confirmed", stats.confirmed)}
      ${stat("Payments Under Verification", stats.paymentsUnderVerification)}
      ${stat("Advance Pending", stats.advancePaymentPending)}
      ${stat("Final Payment Pending", stats.finalPaymentPending)}
      ${stat("Fully Paid", stats.fullyPaidBookings, true)}
      ${stat("Upcoming Trips", stats.upcomingTrips)}
      ${stat("On Trip", stats.onTrip)}
      ${stat("Vehicles Available", stats.vehiclesAvailable)}
      ${stat("Drivers Available", stats.driversAvailable)}
    </div>
    <div class="admin-panel-card">
      <h3>Recent Bookings</h3>
      ${bookingsTable(bookings)}
    </div>`;
}

function bookingsTable(list) {
  if (!list.length) return `<p style="font-size:13px;color:var(--text-500);">No bookings yet.</p>`;
  return `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>Booking ID</th><th>Customer</th><th>Phone</th><th>Route</th><th>Vehicle</th><th>Travel Date</th><th>Base Amount</th><th>Payment</th><th>Booking</th><th>Actions</th></tr></thead>
    <tbody>
      ${list
        .map(
          (b) => `<tr>
        <td><b>${b.bookingId}</b></td>
        <td>${b.customerName || "—"}</td>
        <td>${b.customerPhone || "—"}</td>
        <td>${b.pickupLocation} → ${b.destination}</td>
        <td>${b.assignedVehicle ? b.assignedVehicle.vehicleName : b.requestedVehicleName || "—"}</td>
        <td>${fmtDate(b.travelDate)}</td>
        <td>${fmtCurrency(b.baseAmount)}</td>
        <td><span class="status status-${b.paymentStatus}">${(b.paymentStatus || "").replaceAll("_", " ")}</span></td>
        <td><span class="status status-${b.bookingStatus}">${(b.bookingStatus || "").replaceAll("_", " ")}</span></td>
        <td><a href="#bookings/${b.bookingId}" class="link-btn">View</a></td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table></div>`;
}

/* ---------------- BOOKINGS LIST ---------------- */
async function renderBookingsList() {
  document.getElementById("admin-content").innerHTML = `
    <div class="admin-panel-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;">All Bookings</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="bk-search" placeholder="Search name, email, phone, booking ID…" style="padding:8px 10px;border-radius:8px;border:1px solid var(--stone-200);font-size:13px;">
          <select id="bk-status-filter" style="padding:8px 10px;border-radius:8px;border:1px solid var(--stone-200);font-size:13px;">
            <option value="">All Statuses</option>
            ${["PENDING_APPROVAL","APPROVED","CONFIRMED","REJECTED","CANCELLED","COMPLETED"].map((s) => `<option value="${s}">${s.replaceAll("_"," ")}</option>`).join("")}
          </select>
          <button class="btn btn-outline btn-sm" onclick="reloadBookingsList()">Filter</button>
        </div>
      </div>
      <div id="bookings-table-wrap" style="margin-top:14px;">Loading…</div>
    </div>`;
  await reloadBookingsList();
}
async function reloadBookingsList() {
  const search = document.getElementById("bk-search")?.value.trim() || "";
  const status = document.getElementById("bk-status-filter")?.value || "";
  const { bookings, total } = await api.adminBookingsList({ search, status, pageSize: 100 });
  const wrap = document.getElementById("bookings-table-wrap");
  if (wrap) {
    document.querySelector(".admin-panel-card h3").textContent = `All Bookings (${total})`;
    wrap.innerHTML = bookingsTable(bookings);
  }
}

/* ---------------- BOOKING DETAIL ---------------- */
async function renderBookingDetail(bookingId) {
  const root = document.getElementById("admin-content");
  root.innerHTML = `<p style="padding:20px;color:var(--text-500);">Loading…</p>`;
  const { booking: b, auditLogs } = await api.adminBookingDetail(bookingId);

  const [{ vehicles }, { drivers }] = await Promise.all([api.adminVehiclesList(), api.adminDriversList()]);
  const payUrlFor = (token) => `${location.origin}${location.pathname.replace("admin.html", "")}payment.html?token=${token}`;
  const invUrl = `${location.origin}${location.pathname.replace("admin.html", "")}invoice.html?bookingId=${encodeURIComponent(b.bookingId)}`;

  const activeAdvanceReq = (b.paymentRequests || []).find((r) => r.paymentStage === "ADVANCE" && r.status === "ACTIVE");
  const activeFinalReq = (b.paymentRequests || []).find((r) => r.paymentStage === "FINAL" && r.status === "ACTIVE");
  const pendingPayments = (b.payments || []).filter((p) => p.status === "UNDER_VERIFICATION");

  root.innerHTML = `
    <a href="#bookings" class="link-btn" style="margin-bottom:14px;display:inline-block;">&larr; Back to Bookings</a>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:20px;">${b.bookingId}</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span class="status status-${b.bookingStatus}">${b.bookingStatus.replaceAll("_", " ")}</span>
        <span class="status status-${b.paymentStatus}">${b.paymentStatus.replaceAll("_", " ")}</span>
        <span class="status status-${b.tripStatus}">${b.tripStatus.replaceAll("_", " ")}</span>
      </div>
    </div>

    <div class="admin-panel-card">
      <h3>Customer &amp; Travel Information</h3>
      <div class="kv-row"><span>Name</span><b>${b.customerName || "—"}</b></div>
      <div class="kv-row"><span>Phone</span><b>${b.customerPhone || "—"}</b></div>
      <div class="kv-row"><span>Email</span><b>${b.customerEmail || "—"}</b></div>
      <div class="kv-row"><span>Pickup → Destination</span><b>${b.pickupLocation} → ${b.destination}</b></div>
      <div class="kv-row"><span>Travel / Return Date</span><b>${fmtDate(b.travelDate)} ${b.returnDate ? "→ " + fmtDate(b.returnDate) : ""}</b></div>
      <div class="kv-row"><span>Requested Vehicle</span><b>${b.requestedVehicleName || "—"}</b></div>
      <div class="kv-row"><span>Passengers</span><b>${b.passengerCount || "—"}</b></div>
      <div class="kv-row"><span>Trip Type</span><b>${b.tripType || "—"}</b></div>
      <div class="kv-row"><span>Special Requirements</span><b>${b.specialRequirements || "—"}</b></div>
      <div class="kv-row"><span>Created</span><b>${fmtDate(b.createdAt)}</b></div>
    </div>

    ${b.bookingStatus === "PENDING_APPROVAL" ? `
    <div class="admin-panel-card">
      <h3>Approve Booking &amp; Set Pricing</h3>
      <form onsubmit="handleApprove(event,'${b.bookingId}')" class="form-grid cols-3">
        <div class="field"><label>Base Booking Amount (₹)</label><input type="number" name="baseAmount" min="0" required></div>
        <div class="field"><label>Advance Mode</label>
          <select name="advanceMode" onchange="toggleAdvanceModeFields(this)">
            <option value="DEFAULT_PERCENT">Default (30%)</option>
            <option value="CUSTOM_PERCENT">Custom Percentage</option>
            <option value="MANUAL_AMOUNT">Manual Amount</option>
          </select>
        </div>
        <div class="field" id="advance-percent-field" style="display:none;"><label>Advance Percentage</label><input type="number" name="advancePercentage" min="0" max="100"></div>
        <div class="field" id="advance-manual-field" style="display:none;"><label>Manual Advance Amount (₹)</label><input type="number" name="manualAdvanceAmount" min="0"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Approve &amp; Send Payment Request</button></div>
      </form>
      <div class="modal-actions" style="margin-top:10px;">
        <button class="btn btn-danger btn-sm" onclick="handleRejectBooking('${b.bookingId}')">Reject Booking</button>
      </div>
    </div>` : ""}

    <div class="admin-panel-card">
      <h3>Financial Summary</h3>
      <div class="kv-row"><span>Base Amount</span><b>${fmtCurrency(b.baseAmount)}</b></div>
      <div class="kv-row"><span>Advance Required</span><b>${fmtCurrency(b.advanceRequiredAmount)}</b></div>
      <div class="kv-row"><span>Advance Paid</span><b>${fmtCurrency(b.advancePaidAmount)}</b></div>
      <div class="kv-row"><span>Remaining Base Amount</span><b>${fmtCurrency(b.remainingBaseAmount)}</b></div>
      <div class="kv-row"><span>Additional Charges Total</span><b>${fmtCurrency(b.additionalChargesTotal)}</b></div>
      <div class="kv-row"><span>Final Amount Due</span><b>${fmtCurrency(b.finalAmountDue)}</b></div>
      <div class="kv-row"><span>Total Paid</span><b>${fmtCurrency(b.totalPaidAmount)}</b></div>
      <div class="kv-row"><span>Outstanding Balance</span><b>${fmtCurrency(b.outstandingBalance)}</b></div>
      ${activeAdvanceReq ? `<div class="kv-row"><span>Advance Payment Link</span><b><a href="${payUrlFor(activeAdvanceReq.secureToken)}" target="_blank" style="color:var(--gold-600);">Open</a></b></div>` : ""}
      ${activeFinalReq ? `<div class="kv-row"><span>Final Payment Link</span><b><a href="${payUrlFor(activeFinalReq.secureToken)}" target="_blank" style="color:var(--gold-600);">Open</a></b></div>` : ""}
      ${activeAdvanceReq ? `<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="handleSendReminder('${b.bookingId}','ADVANCE')">Send Advance Payment Reminder</button>` : ""}
      ${activeFinalReq ? `<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="handleSendReminder('${b.bookingId}','FINAL')">Send Final Payment Reminder</button>` : ""}
    </div>

    ${pendingPayments.length ? `
    <div class="admin-panel-card" style="border-color:var(--warning);background:var(--warning-bg);">
      <h3 style="color:var(--warning);">Payments Awaiting Verification</h3>
      ${pendingPayments.map((p) => `
        <div style="border:1px solid var(--stone-200);border-radius:10px;padding:12px;margin-top:10px;background:#fff;">
          <div class="kv-row"><span>Stage</span><b>${p.paymentStage}</b></div>
          <div class="kv-row"><span>Amount</span><b>${fmtCurrency(p.amount)}</b></div>
          <div class="kv-row"><span>Transaction Ref</span><b>${p.transactionReference || "—"}</b></div>
          <div class="kv-row"><span>Submitted</span><b>${fmtDate(p.submittedAt)}</b></div>
          ${p.receiptUrl ? `<a class="btn btn-outline btn-sm" target="_blank" href="${p.receiptUrl}" style="margin-top:6px;display:inline-block;">${icon("eye", 14)} View Receipt</a>` : ""}
          <div class="modal-actions" style="margin-top:10px;">
            <button class="btn btn-success btn-sm" onclick="handleVerifyPayment('${p.id}','APPROVE')">${icon("check", 14)} Approve</button>
            <button class="btn btn-danger btn-sm" onclick="handleVerifyPayment('${p.id}','REJECT')">${icon("x", 14)} Reject</button>
          </div>
        </div>`).join("")}
    </div>` : ""}

    <div class="admin-panel-card">
      <h3>Vehicle &amp; Driver Assignment</h3>
      <div class="kv-row"><span>Assigned Vehicle</span><b>${b.assignedVehicle ? `${b.assignedVehicle.vehicleName}${b.assignedVehicle.vehicleNumber ? " · " + b.assignedVehicle.vehicleNumber : ""}` : "Not assigned"}</b></div>
      <div class="kv-row"><span>Assigned Driver</span><b>${b.assignedDriver ? `${b.assignedDriver.driverName} · ${b.assignedDriver.phone}` : "Not assigned"}</b></div>
      <div class="form-grid cols-3" style="margin-top:12px;">
        <div class="field"><label>Assign Vehicle</label>
          <select id="assign-vehicle-select">
            <option value="">— Select —</option>
            ${vehicles.map((v) => `<option value="${v.id}" ${b.assignedVehicleId === v.id ? "selected" : ""}>${v.vehicleName} (${v.status})</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-sm" onclick="handleAssignVehicle('${b.bookingId}')">Assign Vehicle</button></div>
        <div class="field"></div>
        <div class="field"><label>Assign Driver</label>
          <select id="assign-driver-select">
            <option value="">— Select —</option>
            ${drivers.map((d) => `<option value="${d.id}" ${b.assignedDriverId === d.id ? "selected" : ""}>${d.driverName} (${d.status})</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-primary btn-sm" onclick="handleAssignDriver('${b.bookingId}')">Assign Driver</button></div>
      </div>
      <div class="field" style="margin-top:12px;max-width:280px;"><label>Trip Status</label>
        <select id="trip-status-select">
          ${["NOT_ASSIGNED","VEHICLE_ASSIGNED","UPCOMING","ON_TRIP","TRAVEL_COMPLETED"].map((s) => `<option value="${s}" ${b.tripStatus===s?"selected":""}>${s.replaceAll("_"," ")}</option>`).join("")}
        </select>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="handleUpdateTripStatus('${b.bookingId}')">Update Trip Status</button>
      </div>
    </div>

    ${b.tripStatus === "TRAVEL_COMPLETED" ? renderChargesPanel(b) : ""}

    ${b.paymentStatus === "FULLY_PAID" ? `
    <div class="admin-panel-card" style="border-color:var(--success);background:var(--success-bg);">
      <h3 style="color:var(--success);">✅ Fully Paid</h3>
      ${b.invoices && b.invoices.find((i) => i.invoiceType === "FINAL") ? `
        <p style="font-size:13px;">Invoice ${b.invoices.find((i) => i.invoiceType === "FINAL").invoiceNumber} generated.</p>
        <a class="btn btn-outline btn-sm" target="_blank" href="${invUrl}">${icon("eye", 14)} View Invoice</a>
      ` : `<button class="btn btn-primary btn-sm" onclick="handleGenerateInvoice('${b.bookingId}')">${icon("file", 14)} Generate Final Invoice</button>`}
    </div>` : ""}

    <div class="admin-panel-card">
      <h3>Booking Timeline</h3>
      ${(b.timelineEvents || []).map((ev) => `<div class="kv-row"><span>${fmtDate(ev.createdAt)}</span><b>${ev.customerTitle}</b></div>`).join("") || `<p style="font-size:13px;color:var(--text-500);">No events yet.</p>`}
    </div>

    <div class="admin-panel-card">
      <h3>Email History</h3>
      ${renderEmailHistoryTable(b.emailLogs)}
    </div>

    <div class="admin-panel-card">
      <h3>Audit Log</h3>
      ${(auditLogs || []).length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Action</th><th>By</th><th>When</th></tr></thead><tbody>${auditLogs.map((a) => `<tr><td>${a.actionType.replaceAll("_"," ")}</td><td>${a.adminId}</td><td>${fmtDate(a.createdAt)}</td></tr>`).join("")}</tbody></table></div>` : `<p style="font-size:13px;color:var(--text-500);">No audit entries yet.</p>`}
    </div>`;
}

function toggleAdvanceModeFields(select) {
  document.getElementById("advance-percent-field").style.display = select.value === "CUSTOM_PERCENT" ? "" : "none";
  document.getElementById("advance-manual-field").style.display = select.value === "MANUAL_AMOUNT" ? "" : "none";
}

function renderChargesPanel(b) {
  return `<div class="admin-panel-card">
    <h3>Final Charges (Toll / Parking / Other)</h3>
    ${(b.charges || []).map((c) => `<div class="kv-row"><span>${c.chargeType}${c.description ? " — " + c.description : ""}</span><b>${fmtCurrency(c.amount)} <button class="link-btn" style="color:var(--danger);margin-left:8px;" onclick="handleRemoveCharge('${b.bookingId}','${c.id}')">Remove</button></b></div>`).join("") || `<p style="font-size:13px;color:var(--text-500);">No charges added yet.</p>`}
    <form onsubmit="handleAddCharge(event,'${b.bookingId}')" class="form-grid cols-3" style="margin-top:12px;">
      <div class="field"><label>Charge Type</label>
        <select name="chargeType"><option value="TOLL">Toll</option><option value="PARKING">Parking</option><option value="OTHER">Other</option></select>
      </div>
      <div class="field"><label>Description (required for Other)</label><input name="description"></div>
      <div class="field"><label>Amount (₹)</label><input type="number" name="amount" min="0" required></div>
      <div class="field"><label>&nbsp;</label><button class="btn btn-outline btn-sm" type="submit">Add Charge</button></div>
    </form>
    ${b.paymentStatus !== "FINAL_PAYMENT_REQUIRED" && b.paymentStatus !== "FULLY_PAID" && Number(b.outstandingBalance) > 0 ? `
      <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="handleFinalizeCharges('${b.bookingId}')">${icon("check", 14)} Finalize Charges &amp; Send Final Payment Request</button>
    ` : ""}
  </div>`;
}

function renderEmailHistoryTable(logs) {
  if (!logs || !logs.length) return `<p style="font-size:13px;color:var(--text-500);">No emails sent for this booking yet.</p>`;
  return `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>Type</th><th>Recipient</th><th>Subject</th><th>Sent</th><th>Status</th><th>Error / Message ID</th><th>Actions</th></tr></thead>
    <tbody>${logs
      .map(
        (l) => `<tr>
      <td>${l.emailType.replaceAll("_", " ")}</td>
      <td>${l.recipient}</td>
      <td>${l.subject || "—"}</td>
      <td>${fmtDate(l.sentAt || l.createdAt)}</td>
      <td><span class="status ${l.status === "SENT" ? "status-FULLY_PAID" : "status-CANCELLED"}">${l.status}</span></td>
      <td style="max-width:220px;white-space:normal;font-size:11px;color:var(--text-500);">${l.resendMessageId || l.errorMessage || "—"}</td>
      <td><button class="link-btn" onclick="handleResendEmail('${l.id}')">Resend</button></td>
    </tr>`
      )
      .join("")}</tbody>
  </table></div>`;
}

/* ---------------- BOOKING ACTIONS ---------------- */
async function handleApprove(e, bookingId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api.adminApproveBooking({
      bookingId,
      baseAmount: Number(fd.get("baseAmount") || 0),
      advanceMode: fd.get("advanceMode"),
      advancePercentage: Number(fd.get("advancePercentage") || 0),
      manualAdvanceAmount: Number(fd.get("manualAdvanceAmount") || 0),
    });
    toast("Booking approved. Payment request sent.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not approve booking.", "error");
  }
}
async function handleRejectBooking(bookingId) {
  const reason = prompt("Reason for rejecting this booking (shown to the customer, optional):", "");
  if (reason === null) return;
  try {
    await api.adminRejectBooking(bookingId, reason);
    toast("Booking rejected.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not reject booking.", "error");
  }
}
async function handleAssignVehicle(bookingId) {
  const vehicleId = document.getElementById("assign-vehicle-select").value;
  if (!vehicleId) return toast("Select a vehicle first.", "error");
  try {
    await api.adminAssignVehicle(bookingId, vehicleId);
    toast("Vehicle assigned. Customer notified.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not assign vehicle.", "error");
  }
}
async function handleAssignDriver(bookingId) {
  const driverId = document.getElementById("assign-driver-select").value;
  if (!driverId) return toast("Select a driver first.", "error");
  try {
    await api.adminAssignDriver(bookingId, driverId);
    toast("Driver assigned. Customer notified.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not assign driver.", "error");
  }
}
async function handleUpdateTripStatus(bookingId) {
  const tripStatus = document.getElementById("trip-status-select").value;
  try {
    await api.adminUpdateTripStatus(bookingId, tripStatus);
    toast("Trip status updated.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not update trip status.", "error");
  }
}
async function handleAddCharge(e, bookingId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api.adminAddCharge({ bookingId, chargeType: fd.get("chargeType"), description: fd.get("description"), amount: Number(fd.get("amount") || 0) });
    toast("Charge added.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not add charge.", "error");
  }
}
async function handleRemoveCharge(bookingId, chargeId) {
  if (!confirm("Remove this charge?")) return;
  try {
    await api.adminAddCharge({ bookingId, chargeId, action: "remove" });
    toast("Charge removed.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not remove charge.", "error");
  }
}
async function handleFinalizeCharges(bookingId) {
  if (!confirm("Finalize charges and send the final payment request to the customer?")) return;
  try {
    await api.adminFinalizeCharges(bookingId);
    toast("Final payment request sent.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not finalize charges.", "error");
  }
}
async function handleVerifyPayment(paymentId, decision) {
  let rejectionReason = null;
  if (decision === "REJECT") {
    rejectionReason = prompt("Reason for rejecting this payment (shown to the customer):", "The submitted screenshot could not be verified. Please upload a clearer copy.");
    if (rejectionReason === null) return;
  }
  try {
    await api.adminVerifyPayment(paymentId, decision, rejectionReason);
    toast(decision === "APPROVE" ? "Payment approved." : "Payment rejected. Customer notified.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not verify payment.", "error");
  }
}
async function handleGenerateInvoice(bookingId) {
  try {
    await api.adminGenerateInvoice(bookingId);
    toast("Final invoice generated.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not generate invoice.", "error");
  }
}
async function handleSendReminder(bookingId, stage) {
  try {
    await api.adminSendReminder(bookingId, stage);
    toast("Reminder sent.");
  } catch (err) {
    toast(err.message || "Could not send reminder.", "error");
  }
}
async function handleResendEmail(emailLogId) {
  try {
    await api.adminResendEmail(emailLogId);
    toast("Email resent.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not resend email.", "error");
  }
}

/* ---------------- CUSTOMERS (derived from real bookings) ---------------- */
async function renderCustomers() {
  const { bookings } = await api.adminBookingsList({ pageSize: 100 });
  const map = new Map();
  bookings.forEach((b) => {
    const key = b.customerEmail;
    if (!key) return;
    if (!map.has(key)) map.set(key, { name: b.customerName, phone: b.customerPhone, email: b.customerEmail, count: 0, spend: 0 });
    const c = map.get(key);
    c.count += 1;
    c.spend += Number(b.totalPaidAmount || 0);
  });
  const customers = [...map.values()];
  document.getElementById("admin-content").innerHTML = `
    <div class="admin-panel-card">
      <h3>Customers (${customers.length})</h3>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Bookings</th><th>Total Paid</th></tr></thead>
        <tbody>${customers.length ? customers.map((c) => `<tr><td>${c.name || "—"}</td><td>${c.phone || "—"}</td><td>${c.email || "—"}</td><td>${c.count}</td><td>${fmtCurrency(c.spend)}</td></tr>`).join("") : `<tr><td colspan="5" style="color:var(--text-500);">No customers yet.</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

/* ---------------- FLEET VEHICLES (real DB) ---------------- */
async function renderVehiclesManager() {
  const { vehicles } = await api.adminVehiclesList();
  const editingId = MANAGER_EDIT_ID.dbVehicle;
  const editing = editingId ? vehicles.find((v) => v.id === editingId) : null;

  document.getElementById("admin-content").innerHTML = `
    <div class="admin-panel-card">
      <h3>${editing ? "Edit" : "Add"} Fleet Vehicle</h3>
      <form onsubmit="saveVehicle(event)" class="form-grid cols-3">
        <div class="field"><label>Vehicle Name</label><input name="vehicleName" required value="${editing?.vehicleName || ""}"></div>
        <div class="field"><label>Vehicle Type</label><input name="vehicleType" required value="${editing?.vehicleType || ""}"></div>
        <div class="field"><label>Vehicle Number</label><input name="vehicleNumber" value="${editing?.vehicleNumber || ""}"></div>
        <div class="field"><label>Seating Capacity</label><input type="number" name="seatingCapacity" min="1" required value="${editing?.seatingCapacity || 4}"></div>
        <div class="field"><label>Image URL</label><input name="imageUrl" value="${editing?.imageUrl || ""}"></div>
        <div class="field"><label>Status</label>
          <select name="status">${["AVAILABLE","RESERVED","ON_TRIP","MAINTENANCE","UNAVAILABLE","INACTIVE"].map((s) => `<option value="${s}" ${editing?.status===s?"selected":""}>${s}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Booking Enabled</label><select name="bookingEnabled"><option value="true" ${editing?.bookingEnabled!==false?"selected":""}>Yes</option><option value="false" ${editing?.bookingEnabled===false?"selected":""}>No</option></select></div>
        <div class="field"><label>Recommended</label><select name="recommended"><option value="true" ${editing?.recommended?"selected":""}>Yes</option><option value="false" ${!editing?.recommended?"selected":""}>No</option></select></div>
        <div class="field full"><label>Description</label><textarea name="description" rows="2">${editing?.description || ""}</textarea></div>
        <div class="field full"><label>Features (comma separated)</label><input name="features" value="${(editing?.features || []).join(", ")}"></div>
        <div class="modal-actions">
          <input type="hidden" name="vehicleId" value="${editing?.id || ""}">
          <button class="btn btn-primary" type="submit">${editing ? "Save Changes" : "Add Vehicle"}</button>
          ${editing ? `<button type="button" class="btn btn-outline" onclick="cancelVehicleEdit()">Cancel</button>` : ""}
        </div>
      </form>
    </div>
    <div class="admin-panel-card">
      <h3>Fleet (${vehicles.length})</h3>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Type</th><th>Capacity</th><th>Status</th><th>Booking Enabled</th><th>Recommended</th><th>Upcoming Bookings</th><th>Actions</th></tr></thead>
        <tbody>${vehicles.map((v) => `<tr>
          <td><b>${v.vehicleName}</b></td>
          <td>${v.vehicleType}</td>
          <td>${v.seatingCapacity}</td>
          <td><span class="status status-${v.status}">${v.status}</span></td>
          <td>${v.bookingEnabled ? "Yes" : "No"}</td>
          <td>${v.recommended ? "Yes" : "No"}</td>
          <td>${(v.assignedToBookings || []).length}</td>
          <td><button class="link-btn" onclick="editVehicle('${v.id}')">${icon("edit", 13)} Edit</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>`;
}
function editVehicle(id) { MANAGER_EDIT_ID.dbVehicle = id; renderRoute(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function cancelVehicleEdit() { MANAGER_EDIT_ID.dbVehicle = null; renderRoute(); }
async function saveVehicle(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    vehicleName: fd.get("vehicleName"),
    vehicleType: fd.get("vehicleType"),
    vehicleNumber: fd.get("vehicleNumber") || null,
    seatingCapacity: Number(fd.get("seatingCapacity") || 1),
    imageUrl: fd.get("imageUrl") || null,
    status: fd.get("status"),
    bookingEnabled: fd.get("bookingEnabled") === "true",
    recommended: fd.get("recommended") === "true",
    description: fd.get("description") || null,
    features: (fd.get("features") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  const vehicleId = fd.get("vehicleId");
  try {
    if (vehicleId) {
      await api.adminVehicleUpdate({ vehicleId, ...payload });
      toast("Vehicle updated.");
    } else {
      await api.adminVehicleCreate(payload);
      toast("Vehicle added.");
    }
    MANAGER_EDIT_ID.dbVehicle = null;
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not save vehicle.", "error");
  }
}

/* ---------------- DRIVERS (real DB) ---------------- */
async function renderDriversManager() {
  const { drivers } = await api.adminDriversList();
  const editingId = MANAGER_EDIT_ID.driver;
  const editing = editingId ? drivers.find((d) => d.id === editingId) : null;

  document.getElementById("admin-content").innerHTML = `
    <div class="admin-panel-card">
      <h3>${editing ? "Edit" : "Add"} Driver</h3>
      <form onsubmit="saveDriver(event)" class="form-grid cols-3">
        <div class="field"><label>Driver Name</label><input name="driverName" required value="${editing?.driverName || ""}"></div>
        <div class="field"><label>Phone</label><input name="phone" required value="${editing?.phone || ""}"></div>
        <div class="field"><label>Email</label><input name="email" value="${editing?.email || ""}"></div>
        <div class="field"><label>Status</label>
          <select name="status">${["AVAILABLE","ASSIGNED","ON_TRIP","UNAVAILABLE","INACTIVE"].map((s) => `<option value="${s}" ${editing?.status===s?"selected":""}>${s}</option>`).join("")}</select>
        </div>
        <div class="field full"><label>Notes</label><textarea name="notes" rows="2">${editing?.notes || ""}</textarea></div>
        <div class="modal-actions">
          <input type="hidden" name="driverId" value="${editing?.id || ""}">
          <button class="btn btn-primary" type="submit">${editing ? "Save Changes" : "Add Driver"}</button>
          ${editing ? `<button type="button" class="btn btn-outline" onclick="cancelDriverEdit()">Cancel</button>` : ""}
        </div>
      </form>
    </div>
    <div class="admin-panel-card">
      <h3>Drivers (${drivers.length})</h3>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Default Vehicle</th><th>Upcoming Trips</th><th>Actions</th></tr></thead>
        <tbody>${drivers.map((d) => `<tr>
          <td><b>${d.driverName}</b></td>
          <td>${d.phone}</td>
          <td><span class="status status-${d.status === "AVAILABLE" ? "AVAILABLE" : d.status === "INACTIVE" ? "INACTIVE" : "ON_TRIP"}">${d.status}</span></td>
          <td>${d.defaultVehicle ? d.defaultVehicle.vehicleName : "—"}</td>
          <td>${(d.bookings || []).length}</td>
          <td><button class="link-btn" onclick="editDriver('${d.id}')">${icon("edit", 13)} Edit</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>`;
}
function editDriver(id) { MANAGER_EDIT_ID.driver = id; renderRoute(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function cancelDriverEdit() { MANAGER_EDIT_ID.driver = null; renderRoute(); }
async function saveDriver(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = { driverName: fd.get("driverName"), phone: fd.get("phone"), email: fd.get("email") || null, status: fd.get("status"), notes: fd.get("notes") || null };
  const driverId = fd.get("driverId");
  try {
    if (driverId) {
      await api.adminDriverUpdate({ driverId, ...payload });
      toast("Driver updated.");
    } else {
      await api.adminDriverCreate(payload);
      toast("Driver added.");
    }
    MANAGER_EDIT_ID.driver = null;
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not save driver.", "error");
  }
}

/* ---------------- CUSTOMER QUERIES ---------------- */
async function renderQueriesManager() {
  const { queries } = await api.adminQueriesList();
  document.getElementById("admin-content").innerHTML = `
    <div class="admin-panel-card">
      <h3>Customer Queries (${queries.length})</h3>
      ${queries.length ? queries.map((q) => `
        <div style="border:1px solid var(--stone-200);border-radius:10px;padding:14px;margin-top:12px;">
          <div class="kv-row"><span>Booking</span><b>${q.booking?.bookingId || "—"}</b></div>
          <div class="kv-row"><span>Customer</span><b>${q.booking?.customerName || "—"} (${q.booking?.customerEmail || "—"})</b></div>
          <div class="kv-row"><span>Status</span><b><span class="status status-${q.status === "RESOLVED" ? "FULLY_PAID" : q.status === "UNDER_REVIEW" ? "ADVANCE_PAYMENT_UNDER_VERIFICATION" : "ADVANCE_PAYMENT_REQUIRED"}">${q.status}</span></b></div>
          <p style="font-size:13px;margin-top:8px;"><b>Message:</b> ${q.customerMessage}</p>
          ${q.adminResponse ? `<p style="font-size:13px;margin-top:6px;color:var(--success);"><b>Response:</b> ${q.adminResponse}</p>` : ""}
          <form onsubmit="handleRespondQuery(event,'${q.id}')" style="margin-top:10px;">
            <textarea name="adminResponse" rows="2" placeholder="Write a response…" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--stone-200);"></textarea>
            <div class="modal-actions" style="margin-top:8px;">
              <button class="btn btn-primary btn-sm" type="submit">Respond &amp; Resolve</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="handleSetQueryStatus('${q.id}','UNDER_REVIEW')">Mark Under Review</button>
            </div>
          </form>
        </div>`).join("") : `<p style="font-size:13px;color:var(--text-500);">No customer queries yet.</p>`}
    </div>`;
}
async function handleRespondQuery(e, queryId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const adminResponse = fd.get("adminResponse");
  if (!adminResponse) return;
  try {
    await api.adminRespondQuery({ queryId, adminResponse, status: "RESOLVED" });
    toast("Response saved.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not save response.", "error");
  }
}
async function handleSetQueryStatus(queryId, status) {
  try {
    await api.adminRespondQuery({ queryId, status });
    toast("Status updated.");
    renderRoute();
  } catch (err) {
    toast(err.message || "Could not update status.", "error");
  }
}

/* ---------------- SETTINGS (static marketing content, local only) ---------------- */
function renderSettings() {
  const s = DB.settings;
  document.getElementById("admin-content").innerHTML = `
    <div class="admin-panel-card">
      <h3>Business Display Settings</h3>
      <p style="font-size:12px;color:var(--text-500);margin-bottom:10px;">These control the marketing site's display text only — business data (bookings, payments, vehicles, drivers) is stored in the real database, not here.</p>
      <form onsubmit="saveSettings(event)" class="form-grid cols-3">
        <div class="field"><label>Business Name</label><input name="businessName" value="${s.businessName}"></div>
        <div class="field"><label>Phone</label><input name="phone" value="${s.phone}"></div>
        <div class="field"><label>WhatsApp (with country code, no +)</label><input name="whatsapp" value="${s.whatsapp}"></div>
        <div class="field"><label>Email</label><input name="email" value="${s.email}"></div>
        <div class="field full"><label>Address</label><input name="address" value="${s.address}"></div>
        <div class="field"><label>UPI ID</label><input name="upiId" value="${s.upiId}"></div>
        <div class="field"><label>UPI Display Name</label><input name="upiDisplayName" value="${s.upiDisplayName}"></div>
        <div class="field full"><label>Terms</label><textarea name="terms" rows="2">${s.terms}</textarea></div>
        <div class="field full"><label>Cancellation Policy</label><textarea name="cancellationPolicy" rows="2">${s.cancellationPolicy}</textarea></div>
        <div class="field full"><label>Footer Text</label><input name="footerText" value="${s.footerText}"></div>
        <div class="modal-actions"><button class="btn btn-primary" type="submit">Save Settings</button></div>
      </form>
    </div>
    <div class="admin-panel-card" style="border-color:var(--info);background:var(--info-bg);">
      <h3 style="color:var(--info);">Server Environment Settings</h3>
      <p style="font-size:13px;">UPI ID, Resend sender address, advance defaults, and secrets are configured via Vercel environment variables (DATABASE_URL, RESEND_API_KEY, ADMIN_SESSION_SECRET, UPI_ID, etc.) — see .env.example. They are not editable from this panel for security.</p>
    </div>`;
}
function saveSettings(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  DB.settings = { ...DB.settings, ...Object.fromEntries(fd.entries()) };
  saveDB(DB);
  toast("Display settings saved.");
  renderRoute();
}

/* ============================================================
   GENERIC CRUD MANAGER — marketing content only (destinations,
   tours, services). Fine to remain localStorage-backed: this is
   copy/imagery for the public site, not business data.
   ============================================================ */
function fieldsToFormHtml(fields, item) {
  return fields
    .map((f) => {
      const raw = item[f.key];
      const val = Array.isArray(raw) ? raw.join(", ") : raw !== undefined ? raw : "";
      if (f.type === "textarea") return `<div class="field full"><label>${f.label}</label><textarea name="${f.key}" rows="2">${val}</textarea></div>`;
      if (f.type === "checkbox") return `<div class="field"><label>${f.label}</label><select name="${f.key}"><option value="true" ${raw ? "selected" : ""}>Yes</option><option value="false" ${!raw ? "selected" : ""}>No</option></select></div>`;
      return `<div class="field"><label>${f.label}</label><input name="${f.key}" type="${f.type || "text"}" value="${val}"></div>`;
    })
    .join("");
}
function formToItem(fields, fd) {
  const item = {};
  fields.forEach((f) => {
    let v = fd.get(f.key);
    if (f.type === "checkbox") v = v === "true";
    else if (f.type === "csv") v = v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
    else if (f.type === "number") v = Number(v) || 0;
    item[f.key] = v;
  });
  return item;
}
function renderManager(collectionKey, fields, opts) {
  const items = DB[collectionKey];
  const editingId = MANAGER_EDIT_ID[collectionKey];
  const editing = editingId ? items.find((i) => i.id === editingId) : null;

  document.getElementById("admin-content").innerHTML = `
    <div class="admin-panel-card">
      <h3>${editing ? "Edit" : "Add New"} ${opts.singular}</h3>
      <form onsubmit="saveManagerItem(event,'${collectionKey}')" class="form-grid cols-3">
        ${fieldsToFormHtml(fields, editing || {})}
        <div class="modal-actions">
          <button class="btn btn-primary" type="submit">${editing ? "Save Changes" : "Add " + opts.singular}</button>
          ${editing ? `<button type="button" class="btn btn-outline" onclick="cancelManagerEdit('${collectionKey}')">Cancel</button>` : ""}
        </div>
      </form>
    </div>
    <div class="admin-panel-card">
      <h3>${opts.plural} (${items.length})</h3>
      <div class="admin-table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Details</th><th>Featured</th><th>Actions</th></tr></thead>
        <tbody>${items
          .map(
            (i) => `<tr>
          <td><b>${i[opts.nameKey]}</b></td>
          <td>${opts.summary(i)}</td>
          <td>${i.featured ? `<span class="status status-CONFIRMED">Featured</span>` : "—"}</td>
          <td><button class="link-btn" onclick="editManagerItem('${collectionKey}','${i.id}')">${icon("edit", 13)} Edit</button> ·
              <button class="link-btn" style="color:var(--danger);" onclick="deleteManagerItem('${collectionKey}','${i.id}')">${icon("trash", 13)} Delete</button></td>
        </tr>`
          )
          .join("")}</tbody>
      </table></div>
    </div>`;
}
function editManagerItem(collectionKey, id) {
  MANAGER_EDIT_ID[collectionKey] = id;
  renderRoute();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function cancelManagerEdit(collectionKey) {
  MANAGER_EDIT_ID[collectionKey] = null;
  renderRoute();
}
function deleteManagerItem(collectionKey, id) {
  if (!confirm("Delete this item? This cannot be undone.")) return;
  DB[collectionKey] = DB[collectionKey].filter((i) => i.id !== id);
  saveDB(DB);
  toast("Deleted.");
  renderRoute();
}
function saveManagerItem(e, collectionKey) {
  e.preventDefault();
  const fieldsMap = { destinations: DEST_FIELDS, tours: TOUR_FIELDS, services: SERVICE_FIELDS };
  const fields = fieldsMap[collectionKey];
  const fd = new FormData(e.target);
  const data = formToItem(fields, fd);
  const editingId = MANAGER_EDIT_ID[collectionKey];
  if (editingId) {
    const idx = DB[collectionKey].findIndex((i) => i.id === editingId);
    DB[collectionKey][idx] = { ...DB[collectionKey][idx], ...data };
    MANAGER_EDIT_ID[collectionKey] = null;
    toast("Saved changes.");
  } else {
    DB[collectionKey].push({ id: uid(collectionKey.slice(0, 3)), ...data });
    toast("Added successfully.");
  }
  saveDB(DB);
  renderRoute();
}

const DEST_FIELDS = [
  { key: "name", label: "Destination Name" },
  { key: "place", label: "Location Note" },
  { key: "img", label: "Image URL" },
  { key: "desc", label: "Description", type: "textarea" },
  { key: "featured", label: "Featured (shows in homepage hero)", type: "checkbox" },
];
const TOUR_FIELDS = [
  { key: "name", label: "Package Name" },
  { key: "route", label: "Route" },
  { key: "duration", label: "Duration" },
  { key: "vehicle", label: "Recommended Vehicle" },
  { key: "price", label: "Starting Price (optional)" },
  { key: "img", label: "Image URL" },
  { key: "highlights", label: "Highlights (comma separated)", type: "csv" },
  { key: "featured", label: "Featured", type: "checkbox" },
];
const SERVICE_FIELDS = [
  { key: "title", label: "Service Title" },
  { key: "icon", label: "Icon (car/compass/plane/heart/users/briefcase/sun/train)" },
  { key: "desc", label: "Description", type: "textarea" },
];

function renderDestinationsManager() {
  renderManager("destinations", DEST_FIELDS, { singular: "Destination", plural: "Destinations", nameKey: "name", summary: (d) => d.place });
}
function renderToursManager() {
  renderManager("tours", TOUR_FIELDS, { singular: "Tour Package", plural: "Tour Packages", nameKey: "name", summary: (t) => `${t.route} · ${t.duration}` });
}
function renderServicesManager() {
  renderManager("services", SERVICE_FIELDS, { singular: "Service", plural: "Services", nameKey: "title", summary: (s) => s.desc });
}

/* ---------------- TOAST ---------------- */
function toast(msg, type = "success") {
  let wrap = document.getElementById("toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toast-wrap";
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
