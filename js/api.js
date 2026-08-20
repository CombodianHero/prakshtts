/* ============================================================
   PRAKASH TOUR & TRAVELS — API CLIENT
   Thin fetch() wrappers around the real backend. This file is the
   ONLY place that should ever call fetch("/api/...") — everything
   else (site.js, admin.js, booking-status.js, payment.js) calls
   through here so the transport layer stays in one spot.

   NOTE ON localStorage: js/data.js still holds seed CONTENT
   (destinations, tours, services, reviews, FAQs, business settings
   for display) — that's marketing copy, not the business data the
   spec is about, and is fine to keep client-side. Bookings,
   payments, vehicles-as-bookable-fleet, drivers, invoices, email
   history and admin auth all go through this file to the database.
   ============================================================ */

const API_BASE = ""; // same-origin

async function apiRequest(path, { method = "GET", body, isFormData = false } = {}) {
  const opts = {
    method,
    credentials: "include", // send the admin session cookie
    headers: isFormData ? {} : { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = isFormData ? body : JSON.stringify(body);

  let res;
  try {
    res = await fetch(API_BASE + path, opts);
  } catch (networkErr) {
    throw new Error("Could not reach the server. Please check your connection and try again.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON response */
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  // ---- Customer: bookings ----
  createBooking: (payload) => apiRequest("/api/bookings/create", { method: "POST", body: payload }),
  bookingStatus: (bookingId, email) => apiRequest("/api/booking-status", { method: "POST", body: { bookingId, email } }),
  availableVehicles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/vehicles/available${qs ? "?" + qs : ""}`);
  },
  raiseQuery: (payload) => apiRequest("/api/queries/create", { method: "POST", body: payload }),
  invoiceLookup: (bookingId, email) => apiRequest("/api/invoices/lookup", { method: "POST", body: { bookingId, email } }),

  // ---- Customer: payments ----
  getPaymentByToken: (token) => apiRequest(`/api/payment/${encodeURIComponent(token)}`),
  submitReceipt: (formData) => apiRequest("/api/payment/submit", { method: "POST", body: formData, isFormData: true }),
  createGatewayOrder: (token) => apiRequest("/api/payment/create-order", { method: "POST", body: { token } }),
  verifyGatewayPayment: (payload) => apiRequest("/api/payment/verify-gateway", { method: "POST", body: payload }),

  // ---- Admin: auth ----
  adminLogin: (username, password) => apiRequest("/api/admin/auth/login", { method: "POST", body: { username, password } }),
  adminLogout: () => apiRequest("/api/admin/auth/logout", { method: "POST" }),
  adminMe: () => apiRequest("/api/admin/auth/me"),

  // ---- Admin: dashboard & bookings ----
  adminDashboard: () => apiRequest("/api/admin/dashboard"),
  adminBookingsList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/admin/bookings/list${qs ? "?" + qs : ""}`);
  },
  adminBookingDetail: (bookingId) => apiRequest(`/api/admin/bookings/${encodeURIComponent(bookingId)}`),
  adminApproveBooking: (payload) => apiRequest("/api/admin/bookings/approve", { method: "POST", body: payload }),
  adminRejectBooking: (bookingId, reason) => apiRequest("/api/admin/bookings/reject", { method: "POST", body: { bookingId, reason } }),
  adminAssignVehicle: (bookingId, vehicleId) => apiRequest("/api/admin/bookings/assign-vehicle", { method: "POST", body: { bookingId, vehicleId } }),
  adminAssignDriver: (bookingId, driverId) => apiRequest("/api/admin/bookings/assign-driver", { method: "POST", body: { bookingId, driverId } }),
  adminUpdateTripStatus: (bookingId, tripStatus) => apiRequest("/api/admin/bookings/update-trip-status", { method: "POST", body: { bookingId, tripStatus } }),
  adminAddCharge: (payload) => apiRequest("/api/admin/bookings/add-charge", { method: "POST", body: payload }),
  adminFinalizeCharges: (bookingId) => apiRequest("/api/admin/bookings/finalize-charges", { method: "POST", body: { bookingId } }),
  adminGenerateInvoice: (bookingId) => apiRequest("/api/admin/generate-invoice", { method: "POST", body: { bookingId } }),

  // ---- Admin: payments ----
  adminVerifyPayment: (paymentId, decision, rejectionReason) =>
    apiRequest("/api/admin/payments/verify", { method: "POST", body: { paymentId, decision, rejectionReason } }),
  adminSendReminder: (bookingId, stage) => apiRequest("/api/admin/payments/send-reminder", { method: "POST", body: { bookingId, stage } }),

  // ---- Admin: vehicles ----
  adminVehiclesList: () => apiRequest("/api/admin/vehicles/list"),
  adminVehicleCreate: (payload) => apiRequest("/api/admin/vehicles/create", { method: "POST", body: payload }),
  adminVehicleUpdate: (payload) => apiRequest("/api/admin/vehicles/update", { method: "POST", body: payload }),

  // ---- Admin: drivers ----
  adminDriversList: () => apiRequest("/api/admin/drivers/list"),
  adminDriverCreate: (payload) => apiRequest("/api/admin/drivers/create", { method: "POST", body: payload }),
  adminDriverUpdate: (payload) => apiRequest("/api/admin/drivers/update", { method: "POST", body: payload }),

  // ---- Admin: emails & queries ----
  adminEmailsList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/admin/emails/list${qs ? "?" + qs : ""}`);
  },
  adminResendEmail: (emailLogId) => apiRequest("/api/admin/emails/resend", { method: "POST", body: { emailLogId } }),
  adminQueriesList: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/api/admin/queries/list${qs ? "?" + qs : ""}`);
  },
  adminRespondQuery: (payload) => apiRequest("/api/admin/queries/respond", { method: "POST", body: payload }),
};
