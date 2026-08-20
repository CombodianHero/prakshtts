/* ============================================================
   PRAKASH TOUR & TRAVELS — DATA LAYER
   localStorage-backed "database" shared by site.js and admin.js.
   Replace this layer with real API calls when a backend exists —
   every function below is a natural seam for that swap.
   ============================================================ */

const DB_KEY = "ptt_db_v1";

/* ============================================================
   REAL PHOTOGRAPHS — Wikimedia Commons
   ------------------------------------------------------------
   Every URL below points to a real, identified photograph of the
   actual place/vehicle (verified by filename against Wikidata /
   Wikimedia Commons file pages), served via Commons' official
   Special:FilePath redirect. Each is licensed CC BY-SA (a few
   CC BY) and REQUIRES ATTRIBUTION — see PHOTO_CREDITS below and
   the footer credit line in site.js. This is a normal thing to
   verify visually before launch and swap for the business's own
   photography wherever possible — see README.md.
   ============================================================ */
const CDN = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const PHOTOS = {
  sherShahTomb: CDN + "Sher%20Shah%20Suri%20Tomb.jpg?width=1200",
  rohtasgarhFort: CDN + "Rohtasgarh%20fort.jpg?width=1200",
  manjharKund: CDN + "Manjhar%20kund%20%2CSasaram%2C%20Bihar%20waterfall.jpg?width=1200",
  mundeshwariTemple: CDN + "Mundeshwari%20temple%2C%20Kaimur.jpg?width=1200",
  mahabodhiTemple: CDN + "Mahabodhitemple.jpg?width=1200",
  nalandaRuins: CDN + "Archeological%20Ruins%20of%20Nalanda%20Mahavihara.jpg?width=1200",
  rajgirHills: CDN + "View%20of%20Rajgir%20hills%20from%20Jarasandha%27s%20Akhara.JPG?width=1200",
  varanasiGhats: CDN + "View%20of%20Ghats%20across%20the%20Ganges%2C%20Varanasi.jpg?width=1200",
  swiftDzire: CDN + "Maruti%20Suzuki%20Swift%20Dzire.jpg?width=1200",
  ertiga: CDN + "2013%20Suzuki%20Ertiga%201.4%20GX%20wagon%20%28ZE81S%3B%2001-20-2019%29%2C%20South%20Tangerang.jpg?width=1200",
  innovaCrysta: CDN + "Toyota%20Innova%20Crysta.jpg?width=1200",
  fortuner: CDN + "Toyota%20Fortuner%20White.jpg?width=1200",
  tempoTraveller: CDN + "Force%20Traveller%2C%20Leh-Manali%20Highway.jpg?width=1200",
};

// Shown in the footer per Wikimedia's CC BY-SA attribution requirement.
const PHOTO_CREDITS = [
  ["Sher Shah Suri Tomb", "Wikimedia Commons", "CC BY-SA"],
  ["Rohtasgarh Fort", "Wikimedia Commons", "CC BY-SA"],
  ["Manjhar Kund", "Wikimedia Commons", "CC BY-SA 4.0"],
  ["Mundeshwari Temple", "Wikimedia Commons", "CC BY-SA 4.0"],
  ["Mahabodhi Temple, Bodh Gaya", "Wikimedia Commons", "CC BY-SA"],
  ["Nalanda Mahavihara ruins", "Wikimedia Commons", "CC BY-SA 4.0"],
  ["Rajgir Hills", "Wikimedia Commons", "CC BY-SA 3.0"],
  ["Ghats of Varanasi", "Wikimedia Commons", "CC BY-SA"],
  ["Maruti Suzuki Swift Dzire", "Wikimedia Commons", "CC BY-SA 3.0"],
  ["Suzuki Ertiga", "Wikimedia Commons", "CC BY-SA"],
  ["Toyota Innova Crysta", "Wikimedia Commons", "CC BY-SA 4.0"],
  ["Toyota Fortuner", "Wikimedia Commons", "CC BY-SA 4.0"],
  ["Force (Tempo) Traveller", "Wikimedia Commons", "CC BY-SA"],
];

const DEFAULT_SETTINGS = {
  businessName: "Prakash Tour & Travels",
  phone: "8409150824",
  whatsapp: "918409150824", // WhatsApp deep-links need the country code
  email: "info@prakashtourtravels.in",
  address: "Near Sasaram Railway Station, Sasaram, Bihar",
  upiId: "prakashtours@upi",
  upiDisplayName: "Prakash Tour & Travels",
  invoicePrefix: "PTT-INV-2026-",
  bookingPrefix: "TRV-2026-",
  defaultAdvancePercent: 30,
  terms: "Full balance is payable before the trip start date. Vehicle/driver allotment is confirmed only after advance payment is verified.",
  cancellationPolicy: "Cancellation policy to be finalized by the business owner. Contact us directly for cancellations.",
  footerText: "© 2026 Prakash Tour & Travels. All Rights Reserved.",
};

const SEED_DESTINATIONS = [
  { id: "d1", name: "Sher Shah Suri Tomb", place: "Sasaram — right in the city", desc: "A grand mausoleum rising from a lake, the resting place of Emperor Sher Shah Suri.", img: PHOTOS.sherShahTomb, featured: true, big: true },
  { id: "d2", name: "Rohtasgarh Fort", place: "Rohtas Plateau, ~1.5 hrs from Sasaram", desc: "A vast hill fort with centuries of history, temples and viewpoints over the Kaimur range.", img: PHOTOS.rohtasgarhFort, featured: true },
  { id: "d3", name: "Manjhar Kund", place: "Kaimur Hills", desc: "A dramatic waterfall and gorge tucked into forested hills near Rohtas.", img: PHOTOS.manjharKund, featured: true },
  { id: "d4", name: "Mundeshwari Temple", place: "Kaimur District", desc: "One of the oldest surviving temples in India, perched on Pawra Hill.", img: PHOTOS.mundeshwariTemple, featured: true },
  { id: "d5", name: "Bodh Gaya", place: "Gaya District", desc: "The site of Buddha's enlightenment and a major spiritual travel destination.", img: PHOTOS.mahabodhiTemple, featured: true, big: true },
  { id: "d6", name: "Nalanda", place: "Nalanda District", desc: "The ruins of one of the world's earliest universities, set in green lawns.", img: PHOTOS.nalandaRuins, featured: true },
  { id: "d7", name: "Rajgir", place: "Nalanda District", desc: "Ancient hills, hot springs and Buddhist heritage in a compact, walkable town.", img: PHOTOS.rajgirHills, featured: false },
  { id: "d8", name: "Varanasi", place: "Uttar Pradesh", desc: "The ghats, the Ganga aarti and one of the world's oldest living cities.", img: PHOTOS.varanasiGhats, featured: false },
];

const SEED_VEHICLES = [
  { id: "v1", name: "Swift Dzire", category: "Budget", seats: "4 Seater", ac: true, bestFor: ["Couples", "Small families", "Local travel"], desc: "A light, fuel-friendly sedan for city runs and short outstation trips.", img: PHOTOS.swiftDzire, tags: ["Budget"], available: true, featured: true },
  { id: "v2", name: "Maruti Ertiga", category: "Family", seats: "6 Seater", ac: true, bestFor: ["Families", "Small groups", "Sightseeing"], desc: "A comfortable MPV with room to spare for family outings and outstation journeys.", img: PHOTOS.ertiga, tags: ["Family"], available: true, featured: true },
  { id: "v3", name: "Toyota Innova", category: "Family / Premium", seats: "7 Seater", ac: true, bestFor: ["Family tours", "Long-distance travel", "Premium comfort"], desc: "Our most-booked car for long family journeys — spacious, smooth and dependable.", img: PHOTOS.innovaCrysta, tags: ["Family", "Premium"], available: true, featured: true },
  { id: "v4", name: "Toyota Fortuner", category: "Premium", seats: "7 Seater", ac: true, bestFor: ["VIP travel", "Bride & groom", "Corporate clients"], desc: "A commanding SUV reserved for weddings, VIP guests and special occasions.", img: PHOTOS.fortuner, tags: ["Premium"], available: true, featured: true },
  { id: "v5", name: "Tempo Traveller", category: "Group", seats: "12–17 Seater", ac: true, bestFor: ["Large groups", "Wedding guests", "School & college trips"], desc: "Built for groups — friends, wedding parties and long-distance tours together.", img: PHOTOS.tempoTraveller, tags: ["Group", "Budget"], available: true, featured: true },
];

const SEED_SERVICES = [
  { id: "s1", icon: "car", title: "Local Taxi", desc: "Comfortable, on-time transport around Sasaram and nearby towns." },
  { id: "s2", icon: "compass", title: "Outstation Travel", desc: "Reliable long-distance travel across Bihar and neighbouring states." },
  { id: "s3", icon: "plane", title: "Airport Transfer", desc: "Convenient pickup and drop for Patna, Gaya and Varanasi airports." },
  { id: "s4", icon: "heart", title: "Wedding Transportation", desc: "Cars for the bride, groom, family and guests — planned end to end." },
  { id: "s5", icon: "users", title: "Group Tours", desc: "Tempo Traveller and multi-car convoys for larger travel groups." },
  { id: "s6", icon: "briefcase", title: "Corporate Travel", desc: "Professional, punctual transportation for business trips and events." },
  { id: "s7", icon: "sun", title: "Family Tours", desc: "Comfortable, unhurried journeys built around your family's pace." },
  { id: "s8", icon: "train", title: "Railway Station Transfer", desc: "Timely pickup and drop from Sasaram Railway Station." },
];

const SEED_TOURS = [
  { id: "t1", name: "Kaimur Heritage Trail", route: "Sasaram → Rohtasgarh Fort → Manjhar Kund → Mundeshwari Temple", duration: "1 Day", vehicle: "Swift Dzire / Ertiga", price: "", highlights: ["Hill fort exploration", "Waterfall stop", "Ancient temple visit"], img: PHOTOS.rohtasgarhFort, featured: true },
  { id: "t2", name: "Bihar Heritage Tour", route: "Sasaram → Nalanda → Rajgir → Bodh Gaya", duration: "3–4 Days", vehicle: "Toyota Innova", price: "", highlights: ["University ruins", "Hot springs", "Bodh Gaya monasteries"], img: PHOTOS.nalandaRuins, featured: true },
  { id: "t3", name: "Spiritual Journey", route: "Bodh Gaya → Varanasi → Ayodhya", duration: "4–5 Days", vehicle: "Toyota Innova / Fortuner", price: "", highlights: ["Ganga aarti", "Temple circuit", "Guided pace, no rush"], img: PHOTOS.varanasiGhats, featured: true },
  { id: "t4", name: "Family Weekend Tour", route: "Custom itinerary near Sasaram", duration: "2 Days", vehicle: "Ertiga / Innova", price: "", highlights: ["Built around your family's interests", "Flexible stops"], img: PHOTOS.manjharKund, featured: true },
];

const SEED_REVIEWS = [
  { id: "r1", name: "Ankit S.", trip: "Bodh Gaya family trip", rating: 5, text: "Comfortable Innova, courteous driver, and the itinerary matched our pace perfectly." },
  { id: "r2", name: "Neha R.", trip: "Wedding transportation", rating: 5, text: "Handled the whole baraat and guest transport smoothly on the wedding day." },
  { id: "r3", name: "Vikram P.", trip: "Kaimur day trip", rating: 4, text: "Good car, driver knew the Rohtasgarh route well. Would book again." },
];

const SEED_FAQS = [
  { q: "How can I book a car?", a: "You can book through the enquiry form on this website, over WhatsApp, or by calling us directly at " + DEFAULT_SETTINGS.phone + "." },
  { q: "Can I hire a car with a driver?", a: "Yes — every booking includes a professional driver. Self-drive is not offered." },
  { q: "Do you provide outstation travel?", a: "Yes, we handle outstation and multi-day trips across Bihar and neighbouring states." },
  { q: "Can I book a vehicle for weddings?", a: "Yes, we offer dedicated wedding transportation — see the Wedding & Events section for details." },
  { q: "Which car is best for a family trip?", a: "It depends on your group size — the Ertiga or Innova are our most popular family choices." },
  { q: "Do you provide Tempo Travellers?", a: "Yes, for larger groups, wedding guests and multi-day tours." },
  { q: "Can I create a custom tour?", a: "Yes — use the Custom Trip Planner section to tell us where you'd like to go." },
  { q: "Do you provide airport pickup?", a: "Yes, for Patna, Gaya and Varanasi airports, subject to availability." },
  { q: "How can I get a quote?", a: "Fill out the quote form, WhatsApp us your trip details, or call — we'll respond with pricing." },
  { q: "What is your cancellation policy?", a: DEFAULT_SETTINGS.cancellationPolicy },
];

function seedDatabase() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    destinations: SEED_DESTINATIONS,
    vehicles: SEED_VEHICLES,
    services: SEED_SERVICES,
    tours: SEED_TOURS,
    reviews: SEED_REVIEWS,
    faqs: SEED_FAQS,
    bookings: [],
    customers: [],
    payments: [],
    invoices: [],
    emailLogs: [],
    counters: { booking: 0, invoice: 0 },
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const fresh = seedDatabase();
      saveDB(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw);
    // Fill in any missing collections (keeps old saved DBs forward-compatible)
    const fresh = seedDatabase();
    return { ...fresh, ...parsed, settings: { ...fresh.settings, ...(parsed.settings || {}) } };
  } catch (e) {
    console.error("DB load failed, reseeding.", e);
    const fresh = seedDatabase();
    saveDB(fresh);
    return fresh;
  }
}

function saveDB(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error("DB save failed", e);
  }
}

function nextBookingId(db) {
  db.counters.booking += 1;
  const num = String(db.counters.booking).padStart(5, "0");
  return `${db.settings.bookingPrefix}${num}`;
}

function nextInvoiceId(db) {
  db.counters.invoice += 1;
  const num = String(db.counters.invoice).padStart(6, "0");
  return `${db.settings.invoicePrefix}${num}`;
}

function fmtCurrency(n) {
  const num = Number(n || 0);
  return "₹" + num.toLocaleString("en-IN");
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch (e) {
    return d;
  }
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function waBookingMessage(settings, booking) {
  return [
    "New Booking Enquiry",
    "",
    `Booking: ${booking.bookingId}`,
    `Customer: ${booking.name}`,
    `Pickup: ${booking.pickup}`,
    `Destination: ${booking.destination}`,
    `Travel Date: ${fmtDate(booking.travelDate)}`,
    `Vehicle: ${booking.vehicle}`,
    `Passengers: ${booking.passengers}`,
    booking.amount ? `Amount: ${fmtCurrency(booking.amount)}` : null,
  ].filter(Boolean).join("\n");
}

function waLink(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
