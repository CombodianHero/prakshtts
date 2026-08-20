/* ============================================================
   PRAKASH TOUR & TRAVELS — CUSTOMER WEBSITE
   ============================================================ */

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0f172a"/>
        <stop offset="1" stop-color="#1e293b"/>
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#g)"/>
    <text x="400" y="290" font-family="sans-serif" font-size="30" fill="#f59e0b" text-anchor="middle" font-weight="700">PRAKASH TOUR &amp; TRAVELS</text>
    <text x="400" y="326" font-family="sans-serif" font-size="15" fill="#e2e8f0" text-anchor="middle">Sasaram, Bihar</text>
  </svg>`);

function withFallback(imgTag) {
  return imgTag.replace("<img ", `<img onerror="this.onerror=null;this.src='${FALLBACK_IMG}';" `);
}

let DB = loadDB();
let heroSlideIndex = 0;
let heroTimer = null;
let currentBookingDraft = null;

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  renderHero();
  renderTrustBar();
  renderDestinations();
  renderFleet("All");
  renderFamily();
  renderWedding();
  renderTours();
  renderServices();
  renderTripPlanner();
  renderGallery("All");
  renderWhyUs();
  renderReviews();
  renderGuide();
  renderFAQ();
  renderFinalCTA();
  renderFooter();
  wireHeaderScroll();
  wireMobileMenu();
  wireBookingModal();
  applySettingsToStaticText();
});

function applySettingsToStaticText() {
  document.title = `${DB.settings.businessName} — ${DB.settings.address.split(",").slice(-2).join(",").trim()}`;
}

/* ---------------- HEADER ---------------- */
function renderHeader() {
  const el = document.getElementById("site-header");
  el.innerHTML = `
    <div class="container row">
      <a href="#home" class="brand">${DB.settings.businessName.split(" ")[0]} <span>${DB.settings.businessName.split(" ").slice(1).join(" ")}</span></a>
      <nav class="nav-desktop">
        <a href="#home">Home</a>
        <a href="#destinations">Destinations</a>
        <a href="#fleet">Our Cars</a>
        <a href="#tours">Tours</a>
        <a href="#services">Services</a>
        <a href="#guide">Travel Guide</a>
        <a href="#why-us">About</a>
        <a href="booking-status.html" style="color:var(--gold-400);">Check Booking Status</a>
        <a href="#contact">Contact</a>
      </nav>
      <div class="header-actions">
        <a class="wa-link" target="_blank" rel="noopener" href="${waLink(DB.settings.whatsapp, "Hi, I'd like to know more about your travel services.")}">${icon("message", 17)} WhatsApp</a>
        <button class="btn btn-primary btn-sm" onclick="openBookingModal()">Book Now</button>
      </div>
      <div class="header-mobile-actions">
        <button class="btn btn-primary btn-sm" onclick="openBookingModal()">Book</button>
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
      <a href="#home" onclick="toggleMobileMenu(false)">Home</a>
      <a href="#destinations" onclick="toggleMobileMenu(false)">Destinations</a>
      <a href="#fleet" onclick="toggleMobileMenu(false)">Our Cars</a>
      <a href="#tours" onclick="toggleMobileMenu(false)">Tours</a>
      <a href="#services" onclick="toggleMobileMenu(false)">Services</a>
      <a href="#guide" onclick="toggleMobileMenu(false)">Travel Guide</a>
      <a href="#why-us" onclick="toggleMobileMenu(false)">About</a>
      <a href="booking-status.html" style="color:#fbbf24;">Check Booking Status</a>
      <a href="#contact" onclick="toggleMobileMenu(false)">Contact</a>
      <a href="${waLink(DB.settings.whatsapp, "Hi, I'd like to know more about your travel services.")}" target="_blank" rel="noopener" style="color:#fbbf24;margin-top:14px;border:none;">${icon("message", 17)} Chat on WhatsApp</a>
    </div>`;
}

function wireHeaderScroll() {
  const el = document.getElementById("site-header");
  window.addEventListener("scroll", () => {
    el.classList.toggle("scrolled", window.scrollY > 40);
  });
}
function wireMobileMenu() {}
function toggleMobileMenu(open) {
  document.getElementById("mobile-menu").classList.toggle("open", open);
}

/* ---------------- HERO SLIDESHOW ---------------- */
function renderHero() {
  const slides = DB.destinations.filter((d) => d.featured).slice(0, 6);
  const slidesHtml = slides
    .map(
      (d, i) => `
    <div class="hero-slide ${i === 0 ? "active" : ""}" data-index="${i}">
      ${withFallback(`<img src="${d.img}" alt="${d.name}, ${d.place}" loading="${i === 0 ? "eager" : "lazy"}">`)}
    </div>`
    )
    .join("");

  const dots = slides.map((_, i) => `<button class="hero-dot ${i === 0 ? "active" : ""}" onclick="goHeroSlide(${i})" aria-label="Slide ${i + 1}"></button>`).join("");

  document.getElementById("hero").innerHTML = `
    <div class="hero-slides" id="hero-slides">${slidesHtml}</div>
    <div class="hero-overlay"></div>
    <button class="hero-arrow prev" onclick="stepHeroSlide(-1)" aria-label="Previous slide">${icon("chevronRight", 18)}</button>
    <button class="hero-arrow next" onclick="stepHeroSlide(1)" aria-label="Next slide">${icon("chevronRight", 18)}</button>
    <div class="hero-dots">${dots}</div>
    <div class="container hero-inner">
      <p class="hero-kicker">Explore &nbsp;•&nbsp; Travel &nbsp;•&nbsp; Celebrate</p>
      <h1>Beautiful Destinations.<br>Comfortable Journeys.</h1>
      <p class="lead">Discover the heritage of Sasaram and beyond, travel comfortably with your family, and make every
      occasion memorable — with reliable cars and professional drivers from ${DB.settings.businessName}.</p>
      <div class="hero-ctas">
        <a href="#destinations" class="btn btn-primary">Explore Destinations ${icon("arrowRight", 16)}</a>
        <a href="#fleet" class="btn btn-outline-dark">Book a Car</a>
      </div>
      <div class="quote-panel">
        <div class="field"><label>${icon("pin", 13)} Pickup</label><input id="qp-pickup" placeholder="Sasaram"></div>
        <div class="field"><label>${icon("pin", 13)} Destination</label><input id="qp-destination" placeholder="Where to?"></div>
        <div class="field"><label>${icon("calendar", 13)} Travel Date</label><input id="qp-date" type="date"></div>
        <div class="field"><label>Passengers</label><input id="qp-pax" type="number" min="1" placeholder="2"></div>
        <div class="field"><label>Vehicle</label>${vehicleSelect("qp-vehicle")}</div>
        <button class="btn btn-primary" onclick="openBookingModal(true)">Get Quote</button>
      </div>
    </div>`;

  heroTimer = setInterval(() => stepHeroSlide(1), 5500);
}

function goHeroSlide(i) {
  const wrap = document.getElementById("hero-slides");
  const slides = wrap.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll(".hero-dot");
  slides.forEach((s, idx) => s.classList.toggle("active", idx === i));
  dots.forEach((d, idx) => d.classList.toggle("active", idx === i));
  heroSlideIndex = i;
}
function stepHeroSlide(dir) {
  const total = document.querySelectorAll(".hero-slide").length || 1;
  heroSlideIndex = (heroSlideIndex + dir + total) % total;
  goHeroSlide(heroSlideIndex);
}

/* ---------------- TRUST BAR ---------------- */
function renderTrustBar() {
  const items = [
    ["shield", "Professional Drivers"],
    ["car", "Comfortable Vehicles"],
    ["compass", "Local & Outstation"],
    ["users", "Family Friendly"],
    ["check", "Easy Booking"],
  ];
  document.getElementById("trust-bar").innerHTML = `
    <div class="container trust-grid">
      ${items.map(([ic, label]) => `<div class="trust-item">${icon(ic, 19)} ${label}</div>`).join("")}
    </div>`;
}

/* ---------------- DESTINATIONS ---------------- */
function renderDestinations() {
  const list = DB.destinations;
  document.getElementById("destinations").innerHTML = `
    <div class="container">
      <div class="section-head">
        <div>
          <div class="eyebrow"><span class="line"></span><span>Destinations</span></div>
          <h2>Where Will Your Journey Take You?</h2>
          <p class="desc">From the tomb of Sher Shah Suri to the hills of Rohtasgarh and the temples of the Buddhist circuit — discover the places, and let us take care of the road.</p>
        </div>
        <a href="#tours" class="btn btn-outline">Explore All Destinations ${icon("chevronRight", 15)}</a>
      </div>
      <div class="dest-grid">
        ${list
          .map(
            (d, i) => `
          <a href="#tours" class="dest-card ${i % 5 === 0 ? "big" : ""}">
            ${withFallback(`<img src="${d.img}" alt="${d.name}" loading="lazy">`)}
            <div class="grad"></div>
            <div class="info">
              <div class="place">${d.place}</div>
              <h3>${d.name}</h3>
              <div class="desc">${d.desc}</div>
            </div>
          </a>`
          )
          .join("")}
      </div>
    </div>`;
}

/* ---------------- FLEET ---------------- */
function renderFleet(filter) {
  const list = filter === "All" ? DB.vehicles : DB.vehicles.filter((v) => v.tags.includes(filter));
  const filters = ["All", "Family", "Premium", "Group", "Budget"];
  document.getElementById("fleet").innerHTML = `
    <div class="container">
      <div class="eyebrow"><span class="line"></span><span>Our Fleet</span></div>
      <div class="section-head">
        <h2>The Right Car for Every Journey.</h2>
        <div class="pill-row">
          ${filters.map((f) => `<button class="pill ${f === filter ? "active" : ""}" onclick="renderFleet('${f}')">${f}</button>`).join("")}
        </div>
      </div>
      <div class="grid grid-3">
        ${list
          .map(
            (v) => `
          <div class="card">
            <div class="vehicle-media">
              ${withFallback(`<img src="${v.img}" alt="${v.name}" loading="lazy">`)}
              ${v.ac ? '<span class="badge-ac">AC</span>' : ""}
            </div>
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3>${v.name}</h3><span class="cat-badge">${v.category}</span>
              </div>
              <p style="font-size:13px;color:var(--text-500);margin-top:4px;">${v.seats}</p>
              <p style="font-size:13px;margin-top:10px;">${v.desc}</p>
              <div class="tag-row">${v.bestFor.map((b) => `<span class="tag">${b}</span>`).join("")}</div>
              <div class="card-actions">
                <a href="#contact" class="btn btn-outline btn-sm">View Details</a>
                <button class="btn btn-primary btn-sm" onclick="openBookingModal(false,'${v.name}')">Book Now</button>
              </div>
            </div>
          </div>`
          )
          .join("")}
      </div>
    </div>`;
}

/* ---------------- FAMILY ---------------- */
function renderFamily() {
  document.getElementById("family").innerHTML = `
    <div class="container split">
      <div class="split-media">${withFallback(`<img src="${PHOTOS.manjharKund}" alt="Family travelling together at Manjhar Kund, Sasaram" loading="lazy">`)}</div>
      <div>
        <div class="eyebrow"><span class="line"></span><span>Family Travel</span></div>
        <h2>Travel Together. Make Memories Together.</h2>
        <p style="margin-top:16px;max-width:480px;">From weekend escapes to long family holidays, choose a comfortable vehicle that keeps everyone together — at a pace that suits your family.</p>
        <ul class="check-list">
          ${["Family vacations", "Weekend trips", "Outstation travel", "Sightseeing", "Religious tours", "Railway station transfers"].map((i) => `<li>${icon("check", 15)} ${i}</li>`).join("")}
        </ul>
        <button class="btn btn-primary" style="margin-top:26px;" onclick="openBookingModal()">Plan a Family Trip</button>
      </div>
    </div>`;
}

/* ---------------- WEDDING ---------------- */
function renderWedding() {
  document.getElementById("wedding").innerHTML = `
    ${withFallback(`<img src="${PHOTOS.fortuner}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.22;">`)}
    <div class="container" style="position:relative;">
      <div class="eyebrow"><span class="line"></span><span>Weddings &amp; Events</span></div>
      <h2 style="max-width:600px;">Make Your Special Day Stress-Free.</h2>
      <p style="margin-top:16px;max-width:520px;">Elegant, dependable transportation for the bride, groom, family and guests — planned around your wedding-day timeline.</p>
      <div class="wedding-pillrow">
        ${["Bride & Groom Transportation", "VIP Cars", "Family Transportation", "Wedding Guest Transportation", "Baraat Transportation", "Venue Transfers"].map((s) => `<span>${s}</span>`).join("")}
      </div>
      <div class="wedding-cars">
        ${[["Fortuner", "Bride / Groom / VIP"], ["Innova", "Family / VIP Guests"], ["Ertiga", "Small Groups"], ["Tempo Traveller", "Wedding Guests"]]
          .map(([car, role]) => `<div class="wedding-car-card"><b>${car}</b><p>${role}</p></div>`)
          .join("")}
      </div>
      <button class="btn btn-primary" style="margin-top:30px;" onclick="openBookingModal(false,'','Wedding')">Plan Wedding Transportation</button>
    </div>`;
}

/* ---------------- TOURS ---------------- */
function renderTours() {
  document.getElementById("tours").innerHTML = `
    <div class="container">
      <div class="eyebrow"><span class="line"></span><span>Tour Packages</span></div>
      <h2 style="margin-bottom:40px;">Planned Routes, Ready to Customize.</h2>
      <div class="grid grid-3" style="grid-template-columns:1fr;">
        <div class="grid" style="grid-template-columns:1fr;gap:20px;">
        ${chunk(DB.tours, 2)
          .map(
            (row) => `<div class="grid grid-3" style="grid-template-columns:1fr 1fr;gap:20px;">
              ${row
                .map(
                  (t) => `
              <div class="tour-card">
                ${withFallback(`<img src="${t.img}" alt="${t.name}" loading="lazy">`)}
                <div class="body">
                  <h3 style="font-size:17px;">${t.name}</h3>
                  <p style="font-size:13px;color:var(--text-500);margin-top:4px;">${t.route}</p>
                  <div class="tour-meta">
                    <span>${icon("clock", 14)} ${t.duration}</span>
                    <span>${icon("car", 14)} ${t.vehicle}</span>
                  </div>
                  <ul class="tour-hl">${t.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>
                  <button class="btn btn-outline btn-sm" style="margin-top:14px;" onclick="openBookingModal(false,'${t.vehicle.split(" / ")[0]}','', '${t.name}')">Get Custom Quote</button>
                </div>
              </div>`
                )
                .join("")}
            </div>`
          )
          .join("")}
        </div>
      </div>
    </div>`;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ---------------- SERVICES ---------------- */
function renderServices() {
  document.getElementById("services").innerHTML = `
    <div class="container">
      <div class="eyebrow"><span class="line"></span><span>Services</span></div>
      <h2 style="margin-bottom:40px;">Travel Services for Every Occasion.</h2>
      <div class="grid grid-4">
        ${DB.services
          .map(
            (s) => `
          <div class="service-card">
            <div class="service-icon">${icon(s.icon, 20)}</div>
            <h3>${s.title}</h3>
            <p>${s.desc}</p>
            <a href="#contact">Learn More ${icon("chevronRight", 13)}</a>
          </div>`
          )
          .join("")}
      </div>
    </div>`;
}

/* ---------------- TRIP PLANNER ---------------- */
function renderTripPlanner() {
  document.getElementById("planner").innerHTML = `
    <div class="container" style="max-width:900px;text-align:center;">
      <div class="eyebrow" style="justify-content:center;"><span class="line"></span><span>Custom Trip Planner</span></div>
      <h2>Tell Us Where You Want to Go.</h2>
      <p style="margin-top:12px;">Share your trip details and we'll get back to you with a plan and a quote.</p>
    </div>
    <div class="container" style="max-width:820px;margin-top:34px;">
      <form class="form-card" id="planner-form" onsubmit="submitPlanner(event)">
        <div class="form-grid cols-3">
          <div class="field"><label>Name</label><input required name="name" placeholder="Your name"></div>
          <div class="field"><label>Phone</label><input required name="phone" type="tel" placeholder="10-digit number"></div>
          <div class="field"><label>Pickup</label><input name="pickup" placeholder="Sasaram" value="Sasaram"></div>
          <div class="field"><label>Destination</label><input required name="destination" placeholder="Where to?"></div>
          <div class="field"><label>Travel Date</label><input name="travelDate" type="date"></div>
          <div class="field"><label>Return Date</label><input name="returnDate" type="date"></div>
          <div class="field"><label>Passengers</label><input name="passengers" type="number" min="1" placeholder="2"></div>
          <div class="field"><label>Number of Days</label><input name="days" type="number" min="1" placeholder="3"></div>
          <div class="field"><label>Preferred Vehicle</label>${vehicleSelect("planner-vehicle", "vehicle")}</div>
          <div class="field"><label>Trip Type</label>
            <select name="tripType"><option>Family</option><option>Wedding</option><option>Corporate</option><option>Group</option><option>Solo / Couple</option></select>
          </div>
          <div class="field"><label>Budget</label><input name="budget" placeholder="Optional"></div>
          <div class="field full"><label>Special Requirements</label><textarea name="notes" rows="3" placeholder="Optional"></textarea></div>
        </div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary" style="max-width:280px;">Get My Custom Trip Plan</button></div>
      </form>
    </div>`;
}
function submitPlanner(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const draft = Object.fromEntries(fd.entries());
  createBooking(draft);
  e.target.reset();
}

/* ---------------- GALLERY ---------------- */
function renderGallery(filter) {
  const GALLERY = [
    { cat: "Destinations", img: DB.destinations[0].img },
    { cat: "Cars", img: DB.vehicles[3].img },
    { cat: "Destinations", img: DB.destinations[1].img },
    { cat: "Cars", img: DB.vehicles[2].img },
    { cat: "Tours", img: DB.tours[0].img },
    { cat: "Destinations", img: DB.destinations[4].img },
    { cat: "Cars", img: DB.vehicles[4].img },
    { cat: "Tours", img: DB.tours[2].img },
  ];
  const filters = ["All", "Destinations", "Cars", "Family", "Weddings", "Tours"];
  const list = filter === "All" ? GALLERY : GALLERY.filter((g) => g.cat === filter);
  document.getElementById("gallery").innerHTML = `
    <div class="container">
      <div class="eyebrow"><span class="line"></span><span>Gallery</span></div>
      <div class="section-head">
        <h2>A Look at the Journey.</h2>
        <div class="pill-row">${filters.map((f) => `<button class="pill ${f === filter ? "active" : ""}" onclick="renderGallery('${f}')">${f}</button>`).join("")}</div>
      </div>
      <div class="gallery-grid">
        ${list.map((g) => `<div class="gallery-item">${withFallback(`<img src="${g.img}" alt="${g.cat}" loading="lazy">`)}</div>`).join("")}
      </div>
    </div>`;
}

/* ---------------- WHY US ---------------- */
function renderWhyUs() {
  const items = [
    ["Comfort", "Well-maintained vehicles kept clean and road-ready."],
    ["Reliability", "Dependable pickups and honest communication."],
    ["Professional Drivers", "Experienced, courteous and familiar with local routes."],
    ["Vehicle Choice", "Cars for couples, families, VIP guests and large groups."],
    ["Flexible Trips", "Local rides, outstation journeys and fully custom tours."],
    ["Easy Booking", "Reach us by call, WhatsApp or the enquiry form."],
  ];
  document.getElementById("why-us").innerHTML = `
    <div class="container">
      <div class="eyebrow"><span class="line"></span><span>Why Choose Us</span></div>
      <h2 style="margin-bottom:40px;">Travel With People Who Know the Roads.</h2>
      <div class="grid grid-3">
        ${items.map(([t, d]) => `<div class="why-card"><h3>${t}</h3><p>${d}</p></div>`).join("")}
      </div>
    </div>`;
}

/* ---------------- REVIEWS ---------------- */
function renderReviews() {
  document.getElementById("reviews").innerHTML = `
    <div class="container">
      <div class="eyebrow"><span class="line"></span><span>Customer Reviews</span></div>
      <h2 style="margin-bottom:40px;">What Travellers Say.</h2>
      <div class="grid grid-3">
        ${DB.reviews
          .map(
            (r) => `
          <div class="review-card">
            <div class="stars">${Array.from({ length: 5 }).map((_, i) => icon("star", 15, i < r.rating ? "" : "")).join("")}</div>
            <p class="text">${r.text}</p>
            <p class="who">${r.name}</p>
            <p class="trip">${r.trip}</p>
          </div>`
          )
          .join("")}
      </div>
      <div style="text-align:center;margin-top:34px;"><a href="#contact" class="btn btn-outline">See More Reviews</a></div>
    </div>`;
}

/* ---------------- TRAVEL GUIDE ---------------- */
function renderGuide() {
  const ARTICLES = [
    { title: "Best Places to Visit Near Sasaram", cat: "Guide", img: DB.destinations[1].img },
    { title: "A First-Timer's Guide to Bodh Gaya", cat: "Destination Guide", img: DB.destinations[4].img },
    { title: "Innova vs Ertiga for Family Tours", cat: "Travel Tips", img: DB.vehicles[2].img },
    { title: "Planning Wedding Transportation: A Checklist", cat: "Weddings", img: DB.vehicles[3].img },
  ];
  document.getElementById("guide").innerHTML = `
    <div class="container">
      <div class="eyebrow"><span class="line"></span><span>Travel Guide</span></div>
      <h2 style="margin-bottom:36px;">Plan Better With Our Guides.</h2>
      <div class="grid grid-4">
        ${ARTICLES.map(
          (a) => `
        <a href="#contact" style="display:block;">
          <div style="border-radius:12px;overflow:hidden;height:150px;">${withFallback(`<img src="${a.img}" alt="${a.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`)}</div>
          <p style="font-size:11px;color:var(--gold-600);font-weight:700;text-transform:uppercase;margin-top:10px;">${a.cat}</p>
          <h3 style="font-size:15px;margin-top:4px;">${a.title}</h3>
        </a>`
        ).join("")}
      </div>
    </div>`;
}

/* ---------------- FAQ ---------------- */
function renderFAQ() {
  document.getElementById("faq").innerHTML = `
    <div class="container" style="max-width:760px;">
      <div class="eyebrow"><span class="line"></span><span>FAQ</span></div>
      <h2 style="margin-bottom:34px;">Frequently Asked Questions.</h2>
      ${DB.faqs
        .map(
          (f, i) => `
        <div class="faq-item" id="faq-${i}">
          <button class="faq-q" onclick="toggleFaq(${i})"><span>${f.q}</span>${icon("chevronDown", 18)}</button>
          <div class="faq-a">${f.a}</div>
        </div>`
        )
        .join("")}
    </div>`;
}
function toggleFaq(i) {
  document.getElementById(`faq-${i}`).classList.toggle("open");
}

/* ---------------- FINAL CTA ---------------- */
function renderFinalCTA() {
  document.getElementById("final-cta").innerHTML = `
    ${withFallback(`<img src="${DB.destinations[2].img}" alt="" loading="lazy">`)}
    <div class="container inner">
      <h2>Wherever You're Going, We're Ready to Take You There.</h2>
      <p>Beautiful destinations, comfortable cars and reliable travel services for every journey and every occasion.</p>
      <div class="ctas">
        <a href="#tours" class="btn btn-primary">Explore Tours</a>
        <a href="#fleet" class="btn btn-outline-dark">Book a Car</a>
        <a href="${waLink(DB.settings.whatsapp, "Hi, I'd like to plan a trip.")}" target="_blank" rel="noopener" class="btn btn-outline-dark">${icon("message", 16)} WhatsApp Us</a>
      </div>
    </div>`;
}

/* ---------------- FOOTER ---------------- */
function renderFooter() {
  document.getElementById("site-footer").innerHTML = `
    <div class="container footer-grid">
      <div>
        <span class="brand" style="color:#fff;">${DB.settings.businessName.split(" ")[0]} <span style="color:var(--gold-400);">${DB.settings.businessName.split(" ").slice(1).join(" ")}</span></span>
        <p style="color:rgba(255,255,255,.55);font-size:13px;margin-top:10px;">${DB.settings.address}</p>
        <div class="footer-contact">
          <span>${icon("phone", 14)} ${DB.settings.phone}</span>
          <span>${icon("message", 14)} WhatsApp Available</span>
          <span>${icon("mail", 14)} ${DB.settings.email}</span>
        </div>
      </div>
      <div><h4>Company</h4><ul><li><a href="#why-us">About</a></li><li><a href="#contact">Contact</a></li><li><a href="#reviews">Reviews</a></li><li><a href="#gallery">Gallery</a></li><li><a href="booking-status.html" style="color:var(--gold-400);">Check Booking Status</a></li></ul></div>
      <div><h4>Travel</h4><ul><li><a href="#destinations">Destinations</a></li><li><a href="#tours">Tour Packages</a></li><li><a href="#guide">Travel Guide</a></li></ul></div>
      <div><h4>Vehicles</h4><ul>${DB.vehicles.map((v) => `<li><a href="#fleet">${v.name}</a></li>`).join("")}</ul></div>
      <div><h4>Services</h4><ul>${DB.services.slice(0, 5).map((s) => `<li><a href="#services">${s.title}</a></li>`).join("")}</ul></div>
    </div>
    <div class="footer-bottom">
      <span>${DB.settings.footerText}</span>
      <span><a href="#" onclick="return false;">Privacy Policy</a><a href="#" onclick="return false;">Terms &amp; Conditions</a><a href="#" onclick="return false;">Cancellation Policy</a><a href="admin.html">Owner Login</a></span>
    </div>
    <div class="container" style="margin-top:14px;">
      <p style="font-size:11px;color:rgba(255,255,255,.4);line-height:1.7;">
        Destination and vehicle photographs courtesy Wikimedia Commons contributors, used under
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener" style="color:rgba(255,255,255,.55);text-decoration:underline;">CC BY-SA</a>.
        Replace with the business's own photography when available — see README.md.
      </p>
    </div>`;

  document.getElementById("mobile-bar").innerHTML = `
    <a href="tel:${DB.settings.phone}">${icon("phone", 18)} Call</a>
    <a class="wa" href="${waLink(DB.settings.whatsapp, "Hi, I'd like to know more about your travel services.")}" target="_blank" rel="noopener">${icon("message", 18)} WhatsApp</a>
    <button class="book" onclick="openBookingModal()">${icon("car", 18)} Book</button>`;
}

/* ---------------- HELPERS ---------------- */
function vehicleSelect(id, name) {
  return `<select id="${id}" ${name ? `name="${name}"` : ""}>
    <option value="">Any Vehicle</option>
    ${DB.vehicles.map((v) => `<option value="${v.name}">${v.name}</option>`).join("")}
  </select>`;
}

/* ============================================================
   BOOKING MODAL + BOOKING CREATION
   ============================================================ */
function wireBookingModal() {
  document.getElementById("booking-modal").innerHTML = `
    <div class="backdrop" onclick="closeBookingModal()"></div>
    <div class="modal-box" id="booking-modal-box"></div>`;
}

function openBookingModal(fromHero, vehicle, serviceType, tourName) {
  const box = document.getElementById("booking-modal-box");
  const heroPickup = fromHero ? document.getElementById("qp-pickup").value : "";
  const heroDest = fromHero ? document.getElementById("qp-destination").value : "";
  const heroDate = fromHero ? document.getElementById("qp-date").value : "";
  const heroPax = fromHero ? document.getElementById("qp-pax").value : "";
  const heroVehicle = fromHero ? document.getElementById("qp-vehicle").value : "";

  box.innerHTML = `
    <button class="modal-close" onclick="closeBookingModal()">${icon("x", 20)}</button>
    <h3 class="modal-title">Get a Quote</h3>
    <p class="modal-sub">Tell us about your trip and we'll get back to you shortly.</p>
    <form id="quote-form" class="form-grid" style="margin-top:20px;" onsubmit="handleQuoteSubmit(event)">
      <div class="field full"><label>Full Name</label><input required name="name" placeholder="Your name"></div>
      <div class="field"><label>Phone Number</label><input required name="phone" type="tel" placeholder="10-digit number"></div>
      <div class="field"><label>WhatsApp Number</label><input name="whatsapp" type="tel" placeholder="Same as phone?"></div>
      <div class="field"><label>Email</label><input name="email" type="email" placeholder="you@email.com"></div>
      <div class="field"><label>Pickup Location</label><input name="pickup" value="${heroPickup || "Sasaram"}"></div>
      <div class="field"><label>Destination</label><input required name="destination" value="${heroDest || (tourName || "")}"></div>
      <div class="field"><label>Date</label><input name="travelDate" type="date" value="${heroDate}"></div>
      <div class="field"><label>Return Date</label><input name="returnDate" type="date"></div>
      <div class="field"><label>Passengers</label><input name="passengers" type="number" min="1" value="${heroPax || 2}"></div>
      <div class="field"><label>Vehicle</label>
        <select name="vehicle" id="modal-vehicle-select">
          <option value="">Any Vehicle</option>
          ${DB.vehicles.map((v) => `<option value="${v.name}" ${v.name === (vehicle || heroVehicle) ? "selected" : ""}>${v.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Service Type</label>
        <select name="serviceType">
          ${["Local", "Outstation", "Airport Transfer", "Wedding", "Group Tour", "Corporate"].map((s) => `<option ${s === serviceType ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="field full"><label>Message</label><textarea name="message" rows="3" placeholder="Anything else we should know?">${tourName ? "Enquiry for: " + tourName : ""}</textarea></div>
      <div class="modal-actions">
        <button type="submit" class="btn btn-primary">Get Quote</button>
        <a class="btn btn-outline" target="_blank" rel="noopener" href="${waLink(DB.settings.whatsapp, "Hi, I'd like to get a quote for a trip.")}">${icon("message", 15)} WhatsApp</a>
        <a class="btn btn-outline" href="tel:${DB.settings.phone}">${icon("phone", 15)} Call</a>
      </div>
    </form>`;
  document.getElementById("booking-modal").classList.add("open");
  refreshVehicleOptions(vehicle || heroVehicle);
}

/* Part 5: the vehicle selector must reflect live database availability, not
   a hardcoded list — this replaces the placeholder options above with the
   real, currently-bookable fleet as soon as the API responds. */
async function refreshVehicleOptions(selectedName) {
  const select = document.getElementById("modal-vehicle-select");
  if (!select) return;
  try {
    const { vehicles } = await api.availableVehicles();
    select.innerHTML =
      `<option value="">Any Vehicle</option>` +
      vehicles
        .map((v) => `<option value="${v.vehicleName}" ${v.vehicleName === selectedName ? "selected" : ""}>${v.vehicleName}${v.recommended ? " ⭐ Recommended" : ""}</option>`)
        .join("");
  } catch (e) {
    // Live fetch failed — keep the static fallback list already rendered.
  }
}

function closeBookingModal() {
  document.getElementById("booking-modal").classList.remove("open");
}

function handleQuoteSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const draft = Object.fromEntries(fd.entries());
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn ? submitBtn.textContent : "";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
  }
  createBooking(draft)
    .then((booking) => showBookingConfirmation(booking))
    .catch((err) => showBookingError(err.message || "Something went wrong. Please try again or contact us directly."))
    .finally(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
}

/* Creates a real, server-side booking via the API — the booking ID and
   PENDING_APPROVAL status come back from the database, never generated
   in the browser. */
async function createBooking(draft) {
  const payload = {
    customerName: draft.name || "",
    customerPhone: draft.phone || "",
    customerEmail: draft.email || "",
    pickupLocation: draft.pickup || "Sasaram",
    destination: draft.destination || "",
    tripType: (draft.serviceType || draft.tripType || "Local").toUpperCase().replace(/\s+/g, "_"),
    travelDate: draft.travelDate || "",
    returnDate: draft.returnDate || "",
    passengerCount: draft.passengers || 1,
    specialRequirements: draft.notes || draft.message || "",
    requestedVehicleName: draft.vehicle || "",
  };
  const result = await api.createBooking(payload);
  return result.booking;
}

function showBookingError(message) {
  const box = document.getElementById("booking-modal-box");
  const existing = box.querySelector(".form-error");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "form-error";
  el.style.cssText = "margin-top:12px;padding:10px 14px;border-radius:8px;background:#fef2f2;color:#b91c1c;font-size:13px;";
  el.textContent = message;
  const form = box.querySelector("#quote-form");
  if (form) form.appendChild(el);
  else box.appendChild(el);
}

function showBookingConfirmation(booking) {
  const box = document.getElementById("booking-modal-box");
  box.innerHTML = `
    <button class="modal-close" onclick="closeBookingModal()">${icon("x", 20)}</button>
    <div class="success-block">
      <div class="success-icon">${icon("check", 26)}</div>
      <h3 class="modal-title">Request received</h3>
      <p style="margin-top:8px;">Your enquiry has been received as <b>${booking.bookingId}</b>. Our team will confirm your quote and share the payment link shortly.</p>
      <p style="font-size:12px;color:var(--text-500);margin-top:8px;">Save your Booking ID — you can check your status anytime.</p>
      <div class="modal-actions" style="justify-content:center;margin-top:18px;">
        <a class="btn btn-primary" href="booking-status.html?bookingId=${encodeURIComponent(booking.bookingId)}">${icon("eye", 15)} Check Booking Status</a>
        <a class="btn btn-outline" target="_blank" rel="noopener" href="${waLink(DB.settings.whatsapp, waBookingMessage(DB.settings, { bookingId: booking.bookingId, name: booking.customerName, pickup: booking.pickupLocation, destination: booking.destination, travelDate: booking.travelDate, vehicle: "", passengers: "" }))}">${icon("message", 15)} Share on WhatsApp</a>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-top:12px;" onclick="closeBookingModal()">Close</button>
    </div>`;
}
