/* ══════════════════════════════════════════
   EVENTFY — app.js
   Algeria-only map:
   • All 58 wilayas (provinces) with coords
   • OSM tiles restricted to Algeria bounds
   • Address search limited to Algeria via
     Nominatim countrycodes=dz
   • GPS auto-validates inside Algeria bounds
   • City dropdown: only Algerian cities
   • Map starts on Algeria overview (fit bounds)
   • User can click map or search to pin
══════════════════════════════════════════ */
'use strict';

/* ── helpers ── */
const $ = id => document.getElementById(id);
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');
const setE = (id, msg) => { const e = $(id); if (e) e.textContent = msg };
const clrE = id => { const e = $(id); if (e) e.textContent = '' };
const addC = (id, c) => { const e = $(id); if (e) e.classList.add(c) };
const remC = (id, c) => { const e = $(id); if (e) e.classList.remove(c) };

/* ── state ── */
const S = { image: null, city: null, mapLoc: null, map: null, marker: null, mapReady: false };

/* ══════════════════════════════════════════
   ALGERIA WILAYAS — all 58 provinces
   (wilaya capital coordinates)
══════════════════════════════════════════ */
const ALGERIA_CITIES = [
  /* code, name (Arabic transcription), lat, lng */
  { code: '01', name: 'Adrar', lat: 27.8742, lng: -0.2939 },
  { code: '02', name: 'Chlef', lat: 36.1647, lng: 1.3317 },
  { code: '03', name: 'Laghouat', lat: 33.8003, lng: 2.8653 },
  { code: '04', name: 'Oum El Bouaghi', lat: 35.8782, lng: 7.1133 },
  { code: '05', name: 'Batna', lat: 35.5547, lng: 6.1736 },
  { code: '06', name: 'Béjaïa', lat: 36.7519, lng: 5.0564 },
  { code: '07', name: 'Biskra', lat: 34.8500, lng: 5.7333 },
  { code: '08', name: 'Béchar', lat: 31.6111, lng: -2.2167 },
  { code: '09', name: 'Blida', lat: 36.4722, lng: 2.8294 },
  { code: '10', name: 'Bouira', lat: 36.3700, lng: 3.9000 },
  { code: '11', name: 'Tamanrasset', lat: 22.7853, lng: 5.5228 },
  { code: '12', name: 'Tébessa', lat: 35.4042, lng: 8.1189 },
  { code: '13', name: 'Tlemcen', lat: 34.8786, lng: -1.3158 },
  { code: '14', name: 'Tiaret', lat: 35.3706, lng: 1.3217 },
  { code: '15', name: 'Tizi Ouzou', lat: 36.7169, lng: 4.0497 },
  { code: '16', name: 'Alger', lat: 36.7372, lng: 3.0869 },
  { code: '17', name: 'Djelfa', lat: 34.6736, lng: 3.2631 },
  { code: '18', name: 'Jijel', lat: 36.8211, lng: 5.7667 },
  { code: '19', name: 'Sétif', lat: 36.1900, lng: 5.4100 },
  { code: '20', name: 'Saïda', lat: 34.8317, lng: 0.1517 },
  { code: '21', name: 'Skikda', lat: 36.8760, lng: 6.9078 },
  { code: '22', name: 'Sidi Bel Abbès', lat: 35.1897, lng: -0.6306 },
  { code: '23', name: 'Annaba', lat: 36.9000, lng: 7.7667 },
  { code: '24', name: 'Guelma', lat: 36.4611, lng: 7.4275 },
  { code: '25', name: 'Constantine', lat: 36.3650, lng: 6.6147 },
  { code: '26', name: 'Médéa', lat: 36.2636, lng: 2.7508 },
  { code: '27', name: 'Mostaganem', lat: 35.9333, lng: 0.0833 },
  { code: '28', name: 'M\'Sila', lat: 35.7058, lng: 4.5408 },
  { code: '29', name: 'Mascara', lat: 35.3956, lng: 0.1400 },
  { code: '30', name: 'Ouargla', lat: 31.9539, lng: 5.3242 },
  { code: '31', name: 'Oran', lat: 35.6911, lng: -0.6417 },
  { code: '32', name: 'El Bayadh', lat: 33.6833, lng: 1.0167 },
  { code: '33', name: 'Illizi', lat: 26.5000, lng: 8.4833 },
  { code: '34', name: 'Bordj Bou Arréridj', lat: 36.0731, lng: 4.7631 },
  { code: '35', name: 'Boumerdès', lat: 36.7667, lng: 3.4667 },
  { code: '36', name: 'El Tarf', lat: 36.7676, lng: 8.3131 },
  { code: '37', name: 'Tindouf', lat: 27.6740, lng: -8.1380 },
  { code: '38', name: 'Tissemsilt', lat: 35.6072, lng: 1.8119 },
  { code: '39', name: 'El Oued', lat: 33.3564, lng: 6.8631 },
  { code: '40', name: 'Khenchela', lat: 35.4333, lng: 7.1333 },
  { code: '41', name: 'Souk Ahras', lat: 36.2869, lng: 7.9514 },
  { code: '42', name: 'Tipaza', lat: 36.5878, lng: 2.4483 },
  { code: '43', name: 'Mila', lat: 36.4500, lng: 6.2667 },
  { code: '44', name: 'Aïn Defla', lat: 36.2642, lng: 1.9656 },
  { code: '45', name: 'Naâma', lat: 33.2667, lng: -0.3000 },
  { code: '46', name: 'Aïn Témouchent', lat: 35.2964, lng: -1.1400 },
  { code: '47', name: 'Ghardaïa', lat: 32.4903, lng: 3.6667 },
  { code: '48', name: 'Relizane', lat: 35.7333, lng: 0.5544 },
  { code: '49', name: 'Timimoun', lat: 29.2636, lng: 0.2306 },
  { code: '50', name: 'Bordj Badji Mokhtar', lat: 21.3258, lng: 0.9564 },
  { code: '51', name: 'Ouled Djellal', lat: 34.4183, lng: 5.0681 },
  { code: '52', name: 'Béni Abbès', lat: 30.1281, lng: -2.1644 },
  { code: '53', name: 'In Salah', lat: 27.1972, lng: 2.4758 },
  { code: '54', name: 'In Guezzam', lat: 19.5667, lng: 5.7667 },
  { code: '55', name: 'Touggourt', lat: 33.0994, lng: 6.0658 },
  { code: '56', name: 'Djanet', lat: 24.5558, lng: 9.4844 },
  { code: '57', name: 'El M\'Ghair', lat: 33.9500, lng: 5.9167 },
  { code: '58', name: 'El Meniaa', lat: 30.5833, lng: 2.8833 },
];

/* Algeria bounding box for restricting map panning */
const DZ_BOUNDS = L.latLngBounds(
  L.latLng(18.9, -8.7),   // SW corner
  L.latLng(37.3, 12.0)   // NE corner
);

/* Algeria centre and overview zoom */
const DZ_CENTER = [28.0339, 1.6596];
const DZ_ZOOM = 5;

/* ══ SCROLL REVEAL ══ */
const revIO = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); revIO.unobserve(e.target); } });
}, { threshold: .07 });
document.querySelectorAll('[data-reveal]').forEach((el, i) => {
  el.style.transitionDelay = (i * .04) + 's'; revIO.observe(el);
});

/* ══ HEADER SCROLL ══ */
window.addEventListener('scroll', () => {
  syncNav();
}, { passive: true });

/* ══ PROGRESS NAV ══ */
const SECS = ['section-media', 'section-info', 'section-datetime', 'section-desc', 'section-location', 'section-capacity', 'section-price'];
document.querySelectorAll('.progress-step').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = $(btn.dataset.target); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
function syncNav() {
  const steps = document.querySelectorAll('.progress-step');
  const lines = document.querySelectorAll('.progress-line');
  let active = 0;
  SECS.forEach((id, i) => { const el = $(id); if (el && el.getBoundingClientRect().top < window.innerHeight * .58) active = i; });
  steps.forEach((s, i) => { s.classList.remove('active', 'done'); if (i < active) s.classList.add('done'); else if (i === active) s.classList.add('active'); });
  lines.forEach((l, i) => l.classList.toggle('done', i < active));
}
syncNav();

/* ══════════════════════════════════════════
   LEAFLET MAP — Algeria only
   Initialised on DOMContentLoaded:
   • Shows overview of all Algeria (blurred)
   • maxBounds locks panning to DZ
   • unlockMap() enables interaction
══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  S.map = L.map('leafletMap', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
    maxBounds: DZ_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: 5,
    maxZoom: 18,
  }).setView(DZ_CENTER, DZ_ZOOM);

  /* OpenStreetMap tiles — Nominatim will provide Algeria-specific search.
     The OSM tile usage policy requires visible attribution. */
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(S.map);
  L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(S.map);

  /* Custom purple pin icon matching the design */
  S.pinIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;
      background:linear-gradient(135deg,#7c3aed,#6d28d9);
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:3px solid #fff;
      box-shadow:0 3px 12px rgba(124,58,237,.5);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  });

  S.mapReady = true;
});

/* Unlock map to full interaction */
function unlockMap() {
  if (!S.map) return;
  S.map.dragging.enable();
  S.map.scrollWheelZoom.enable();
  S.map.doubleClickZoom.enable();
  S.map.touchZoom.enable();
  S.map.keyboard.enable();
  $('leafletMap').classList.add('sharp');
  hide($('mapVeil'));

  /* Restore Algeria bounds after enabling drag */
  S.map.setMaxBounds(DZ_BOUNDS);

  /* Click on map → drop pin + reverse geocode */
  if (!S._clickBound) {
    S._clickBound = true;
    S.map.on('click', e => {
      /* Only pin if click is within Algeria */
      if (!DZ_BOUNDS.contains(e.latlng)) {
        toast('Please select a location inside Algeria 🇩🇿', 'warn');
        return;
      }
      placePin(e.latlng.lat, e.latlng.lng);
      reverseGeocodeAlgeria(e.latlng.lat, e.latlng.lng);
    });
  }
  setTimeout(() => S.map.invalidateSize(), 60);
}

/* Place / move the pin marker */
function placePin(lat, lng) {
  if (S.marker) S.map.removeLayer(S.marker);
  S.marker = L.marker([lat, lng], { icon: S.pinIcon }).addTo(S.map);
  S.mapLoc = { ...(S.mapLoc || {}), lat, lng };
  $('statusDot').className = 'status-dot on';
  $('mapStatusText').textContent = 'Location Pinned';
}

/* Fly to a point smoothly, always inside Algeria */
function flyToAlgeria(lat, lng, zoom) {
  const ll = L.latLng(lat, lng);
  if (!DZ_BOUNDS.contains(ll)) return;
  S.map.flyTo(ll, zoom || 14, { duration: 1.2 });
}

/* ══════════════════════════════════════════
   NOMINATIM — Algeria-only geocoding
   countrycodes=dz  forces results to Algeria
══════════════════════════════════════════ */
const NOM_HEADERS = { 'Accept-Language': 'en,fr,ar', 'User-Agent': 'Eventfy/2.0' };

async function fwdGeocodeAlgeria(q) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=dz&format=json&addressdetails=1&limit=6`;
    const r = await fetch(url, { headers: NOM_HEADERS });
    const data = await r.json();
    return data; // array
  } catch { return []; }
}

async function reverseGeocodeAlgeria(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&countrycodes=dz&format=json&addressdetails=1`;
    const r = await fetch(url, { headers: NOM_HEADERS });
    const d = await r.json();
    /* Check Nominatim confirms it's Algeria */
    if (d.address?.country_code && d.address.country_code !== 'dz') {
      toast('Location must be inside Algeria 🇩🇿', 'warn'); return;
    }
    const display = d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    $('fullAddress').value = display.split(',').slice(0, 4).join(',');
    applyLocation(lat, lng, display, cityFromAddr(d.address));
  } catch {
    applyLocation(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`, '');
  }
}

function cityFromAddr(addr) {
  if (!addr) return '';
  return addr.city || addr.town || addr.village || addr.county || addr.state || '';
}

/* ══════════════════════════════════════════
   ADDRESS SEARCH BAR — Algeria only
══════════════════════════════════════════ */
const addrIn = $('fullAddress');
const addrSug = $('addressSuggestions');
let geoT = null;

addrIn.addEventListener('input', () => {
  clearTimeout(geoT);
  const v = addrIn.value.trim();
  if (v.length < 2) { hide(addrSug); return; }
  geoT = setTimeout(() => showAddressSuggestions(v), 420);
});

async function showAddressSuggestions(q) {
  const results = await fwdGeocodeAlgeria(q);
  if (!results.length) { hide(addrSug); return; }

  addrSug.innerHTML = results.map(it => {
    const parts = it.display_name.split(',');
    const main = parts[0].trim();
    const sub = parts.slice(1, 4).join(',').trim();
    return `<div class="sug-item"
              data-lat="${it.lat}" data-lng="${it.lon}"
              data-display="${it.display_name.replace(/"/g, '&quot;')}"
              data-city="${cityFromAddr(it.address)}">
        <span class="material-symbols-outlined sug-ico">location_on</span>
        <div>
          <div class="sug-main">${main}</div>
          <div class="sug-sub">${sub}</div>
        </div>
      </div>`;
  }).join('');
  show(addrSug);
}

addrSug.addEventListener('click', e => {
  const it = e.target.closest('.sug-item'); if (!it) return;
  const lat = +it.dataset.lat, lng = +it.dataset.lng;
  addrIn.value = it.dataset.display.split(',').slice(0, 4).join(',');
  hide(addrSug);
  unlockMap();
  flyToAlgeria(lat, lng, 15);
  placePin(lat, lng);
  applyLocation(lat, lng, it.dataset.display, it.dataset.city);
});

document.addEventListener('click', e => {
  if (!addrIn.contains(e.target) && !addrSug.contains(e.target)) hide(addrSug);
});

/* ══════════════════════════════════════════
   OPEN MAP BUTTON
══════════════════════════════════════════ */
$('mapViewBtn').addEventListener('click', () => {
  hide($('mapViewBtn'));
  unlockMap();
  setTimeout(() => { if (S.map) S.map.invalidateSize(); }, 100);
  if (S.city) {
    flyToAlgeria(S.city.lat, S.city.lng, 13);
  } else {
    S.map.flyTo(DZ_CENTER, DZ_ZOOM + 1, { duration: 1 });
  }
});

/* ══════════════════════════════════════════
   GPS BUTTON — validates inside Algeria
   Caches coords after first permission grant
   so browser never re-prompts on repeat clicks
══════════════════════════════════════════ */
function useGPSCoords(lat, lng) {
  if (!DZ_BOUNDS.contains(L.latLng(lat, lng))) {
    toast('Your GPS location is outside Algeria 🇩🇿', 'warn'); return;
  }
  unlockMap();
  flyToAlgeria(lat, lng, 15);
  placePin(lat, lng);
  reverseGeocodeAlgeria(lat, lng);
}

$('gpsBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }
  const btn = $('gpsBtn');
  /* Use cached position if available — no permission popup */
  if (S.cachedGPS) { useGPSCoords(S.cachedGPS.lat, S.cachedGPS.lng); return; }
  btn.style.opacity = '.45';
  navigator.geolocation.getCurrentPosition(
    pos => {
      btn.style.opacity = '1';
      const { latitude: lat, longitude: lng } = pos.coords;
      S.cachedGPS = { lat, lng };
      useGPSCoords(lat, lng);
    },
    () => { btn.style.opacity = '1'; toast('GPS permission denied. Search manually.', 'error'); },
    { timeout: 8000, maximumAge: 5 * 60 * 1000 }
  );
});

/* ══════════════════════════════════════════
   APPLY LOCATION — sets confirmed banner
══════════════════════════════════════════ */
function applyLocation(lat, lng, address, city) {
  S.mapLoc = { lat, lng, address, city };
  $('lcAddr').textContent = address.split(',').slice(0, 4).join(',');
  $('lcCityChip').textContent = city || 'Algeria';
  show($('locationConfirmed'));
  clrE('errLocation');
  remC('fullAddress', 'err');
  $('mapStatusText').textContent = 'Location Pinned';
  $('statusDot').className = 'status-dot on';
  /* cross-check with chosen city only if both are set */
  if (S.city) runCityMapCheck();
}

/* Clear location */
$('btnClearLocation').addEventListener('click', () => {
  S.mapLoc = null;
  addrIn.value = '';
  hide($('locationConfirmed'));
  if (S.marker && S.map) { S.map.removeLayer(S.marker); S.marker = null; }
  $('statusDot').className = 'status-dot';
  $('mapStatusText').textContent = 'No Location Selected';
  hide($('lcDistChip'));
  /* Reset map to Algeria overview */
  if (S.map) S.map.flyTo(DZ_CENTER, DZ_ZOOM, { duration: 1 });
});

/* ══════════════════════════════════════════
   CITY ↔ MAP CROSS-CHECK
   Only runs when both sides filled.
   Uses Haversine; tolerance 80 km for Algeria
   (wilayas are large)
══════════════════════════════════════════ */
function runCityMapCheck() {
  if (!S.mapLoc || !S.city) return;
  const mc = (S.mapLoc.city || '').toLowerCase();
  const sc = S.city.name.toLowerCase();
  const dist = haversine(S.mapLoc.lat, S.mapLoc.lng, S.city.lat, S.city.lng);
  const ok = mc.includes(sc) || sc.includes(mc) || dist < 80;
  const chip = $('lcDistChip');
  if (ok) {
    chip.textContent = `✓ Matches ${S.city.name}`;
    chip.className = 'ls-tag t-dist ok';
    show(chip);
  } else {
    chip.textContent = `⚠ ~${Math.round(dist)} km from ${S.city.name}`;
    chip.className = 'ls-tag t-dist';
    show(chip);
    toast(`Map pin is ~${Math.round(dist)} km from "${S.city.name}". Please verify.`, 'warn');
  }
  $('lcCityChip').textContent = S.city.name;
}

function haversine(a, b, c, d) {
  const R = 6371, dA = (c - a) * Math.PI / 180, dB = (d - b) * Math.PI / 180;
  const x = Math.sin(dA / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dB / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ══════════════════════════════════════════
   CITY AUTOCOMPLETE — Algeria only (58 wilayas)
══════════════════════════════════════════ */
const cityIn = $('eventCity');
const cityDrop = $('cityDropdown');

cityIn.addEventListener('input', () => {
  const v = cityIn.value.trim().toLowerCase();
  S.city = null;
  // icon removed
  if (!v) { hide(cityDrop); return; }

  const matches = ALGERIA_CITIES
    .filter(c => c.name.toLowerCase().includes(v) || c.code.includes(v))
    .slice(0, 8);

  if (!matches.length) { hide(cityDrop); return; }

  cityDrop.innerHTML = matches.map(c =>
    `<div class="city-opt"
          data-name="${c.name}"
          data-country="Algeria"
          data-lat="${c.lat}"
          data-lng="${c.lng}">
       <span class="city-flag">🇩🇿</span>
       <span class="city-name">${c.name}</span>
       <span class="city-cntry">W. ${c.code}</span>
     </div>`
  ).join('');
  show(cityDrop);
});

cityDrop.addEventListener('click', e => {
  const opt = e.target.closest('.city-opt'); if (!opt) return;
  S.city = { name: opt.dataset.name, country: 'Algeria', lat: +opt.dataset.lat, lng: +opt.dataset.lng };
  cityIn.value = opt.dataset.name;
  hide(cityDrop);
  setCityIcon('check_circle', 'var(--green)');
  $('detectStatus').textContent = '✓ ' + opt.dataset.name;
  $('detectStatus').style.color = 'var(--green)';
  clrE('errCity');
  remC('eventCity', 'err');
  /* If map already has a pin, re-run cross-check */
  if (S.mapLoc) runCityMapCheck();
  /* Centre the map preview on selected wilaya */
  if (S.map) S.map.setView([S.city.lat, S.city.lng], 11);
});

document.addEventListener('click', e => {
  if (!cityIn.contains(e.target) && !cityDrop.contains(e.target)) hide(cityDrop);
});

function setCityIcon(icon, color) {
  // icon removed from UI
}

/* ── Auto-detect city via GPS → Algeria only ── */
$('detectCityBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }
  const btn = $('detectCityBtn'), ds = $('detectStatus');
  btn.disabled = true;
  ds.textContent = 'Detecting…'; ds.style.color = 'var(--muted)';

  const doDetect = async (lat, lng) => {
    btn.disabled = false;

    if (!DZ_BOUNDS.contains(L.latLng(lat, lng))) {
      ds.textContent = '⚠ Not in Algeria'; ds.style.color = 'var(--rose)';
      toast('Your location appears to be outside Algeria 🇩🇿', 'warn'); return;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&countrycodes=dz&format=json&addressdetails=1`;
      const r = await fetch(url, { headers: NOM_HEADERS });
      const d = await r.json();
      const cn = cityFromAddr(d.address);

      /* Try to match against known wilayas */
      const found = ALGERIA_CITIES.find(c =>
        cn.toLowerCase().includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(cn.toLowerCase())
      );

      if (found) {
        S.city = { name: found.name, country: 'Algeria', lat: found.lat, lng: found.lng };
        cityIn.value = found.name;
        setCityIcon('check_circle', 'var(--green)');
        ds.textContent = '✓ ' + found.name + ' detected'; ds.style.color = 'var(--green)';
        clrE('errCity'); remC('eventCity', 'err');
        S.map?.setView([found.lat, found.lng], 11);
        if (S.mapLoc) runCityMapCheck();
      } else if (cn) {
        S.city = { name: cn, country: 'Algeria', lat, lng };
        cityIn.value = cn;
        setCityIcon('check_circle', 'var(--amber)');
        ds.textContent = cn + ' (near detected)'; ds.style.color = 'var(--amber)';
      } else {
        ds.textContent = 'Could not detect wilaya'; ds.style.color = 'var(--rose)';
      }
    } catch {
      btn.disabled = false;
      ds.textContent = 'Detection failed'; ds.style.color = 'var(--rose)';
    }
  };

  if (S.cachedGPS) {
    /* Already have permission — reuse coords, no popup */
    doDetect(S.cachedGPS.lat, S.cachedGPS.lng);
  } else {
    navigator.geolocation.getCurrentPosition(
      async pos => {
        S.cachedGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        doDetect(S.cachedGPS.lat, S.cachedGPS.lng);
      },
      () => {
        btn.disabled = false;
        ds.textContent = 'Permission denied'; ds.style.color = 'var(--rose)';
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }
});

/* ══════════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════════ */
const zone = $('uploadZone'), fi = $('fileInput');
function handleFile(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast('Use PNG, JPG or WebP.', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Max 5 MB.', 'error'); return; }
  S.image = file;
  const r = new FileReader();
  r.onload = ev => {
    $('previewImg').src = ev.target.result;
    hide($('uploadIdle')); show($('uploadPreview'));
    clrE('errMedia'); toast('Cover image ready ✓', 'success');
  };
  r.readAsDataURL(file);
}
zone.addEventListener('click', () => fi.click());
zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fi.click(); });
fi.addEventListener('change', () => handleFile(fi.files[0]));
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
zone.addEventListener('drop', e => {
  e.preventDefault(); zone.classList.remove('drag'); handleFile(e.dataTransfer.files[0]);
});
$('previewRemove').addEventListener('click', e => {
  e.stopPropagation(); S.image = null; fi.value = ''; $('previewImg').src = '';
  hide($('uploadPreview')); show($('uploadIdle'));
});

/* ══════════════════════════════════════════
   DATE / TIME → DURATION
══════════════════════════════════════════ */
const dateIn = $('startDate'), startIn = $('startTime'), endIn = $('endTime');
const endDateIn = $('endDate'), endTimeIn = $('endTime');
const regDeadlineDateIn = $('regDeadlineDate'), regDeadlineTimeIn = $('regDeadlineTime');
if (dateIn) {
  const t = new Date(), today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  dateIn.min = today; if (!dateIn.value) dateIn.value = today;
}
function fmtT(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function updateDur() {
  const dd = $('durationDisplay'), dt = $('durationText');
  if (!startIn.value || !endIn.value) { hide(dd); return; }
  const [sh, sm] = startIn.value.split(':').map(Number), [eh, em] = endIn.value.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) { dt.textContent = '⚠ End must be after start'; show(dd); return; }
  const h = Math.floor(mins / 60), m = mins % 60;
  dt.textContent = `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'min' : ''} · ${fmtT(startIn.value)} → ${fmtT(endIn.value)}`;
  show(dd);
}
[dateIn, startIn, endIn].filter(Boolean).forEach(e => e.addEventListener('change', updateDur));

/* ══════════════════════════════════════════
   DESCRIPTION CHAR COUNTER
══════════════════════════════════════════ */
const descTA = $('eventDesc');
descTA.addEventListener('input', () => {
  const len = descTA.value.length;
  $('charBadge').textContent = len + '/500 characters';
  const f = $('charBarFill');
  f.style.width = (len / 500 * 100) + '%';
  f.style.background = len > 450 ? 'var(--rose)' : len > 350 ? 'var(--amber)' : 'var(--green)';
});

/* ══════════════════════════════════════════
   FREE TOGGLE + PRICE SUMMARY
══════════════════════════════════════════ */
const freeChk = $('freeEventToggle'), priceIn = $('ticketPrice'), currencySelect = $('currencySelect');
freeChk.addEventListener('change', () => {
  const on = freeChk.checked;
  $('freeToggleCard').classList.toggle('on', on);
  priceIn.disabled = on; priceIn.style.opacity = on ? '.4' : '1';
  if (on) priceIn.value = ''; updatePrice();
});
priceIn.addEventListener('input', updatePrice);

/* Requires Approval toggle feedback */
const approvalChk = $('requiresApprovalToggle');
if (approvalChk) {
  approvalChk.addEventListener('change', () => {
    $('approvalToggleCard')?.classList.toggle('on', approvalChk.checked);
  });
}

if (currencySelect) {
  const prefCurrency = localStorage.getItem('eventfy_currency') || 'DZD';
  currencySelect.value = prefCurrency;
  if ($('priceCurLabel')) $('priceCurLabel').textContent = prefCurrency;

  currencySelect.addEventListener('change', () => {
    const chosen = currencySelect.value;
    if ($('priceCurLabel')) $('priceCurLabel').textContent = chosen;
    updatePrice();
  });
}

function updatePrice() {
  const ps = $('priceSummary');
  if (freeChk.checked) {
    $('summaryPrice').textContent = 'FREE'; $('summaryFee').textContent = '—'; $('summaryTotal').textContent = '—';
    show(ps); return;
  }
  const v = parseFloat(priceIn.value);
  if (!isNaN(v) && priceIn.value !== '') {
    const chosenCurrency = currencySelect ? currencySelect.value : 'DZD';
    const fee = +(v * .05).toFixed(2), tot = +(v - fee).toFixed(2);
    const locale = chosenCurrency === 'USD' ? 'en-US' : (chosenCurrency === 'EUR' ? 'fr-FR' : 'fr-DZ');
    $('summaryPrice').textContent = v.toLocaleString(locale) + ' ' + chosenCurrency;
    $('summaryFee').textContent = fee.toLocaleString(locale) + ' ' + chosenCurrency;
    $('summaryTotal').textContent = tot.toLocaleString(locale) + ' ' + chosenCurrency;
    show(ps);
  } else hide(ps);
}

/* ══════════════════════════════════════════
   VALIDATION
══════════════════════════════════════════ */
function clearErrs() {
  ['errMedia', 'errTitle', 'errCity', 'errVenue', 'errStartDate', 'errStart', 'errDesc', 'errLocation', 'errSeats', 'errPrice'].forEach(clrE);
  ['eventTitle', 'eventCity', 'venueName', 'startDate', 'startTime', 'eventDesc', 'fullAddress', 'availableSeats', 'ticketPrice',
   'regDeadlineDate', 'endDate'].forEach(id => remC(id, 'err'));
  descTA.classList.remove('err');
}

function validate() {
  clearErrs(); const errs = [];
  if (!S.image && !S.editId) { setE('errMedia', 'Please upload a cover image.'); errs.push('img'); }
  const t = $('eventTitle'), tl = t.value.trim().length;
  if (!tl) { t.classList.add('err'); setE('errTitle', 'Event title is required.'); errs.push('title'); }
  else if (tl < 3 || tl > 50) { t.classList.add('err'); setE('errTitle', 'Use between 3 and 50 characters.'); errs.push('title'); }
  if (!$('eventCity').value.trim()) { addC('eventCity', 'err'); setE('errCity', 'City (wilaya) is required.'); errs.push('city'); }
  const v = $('venueName'); if (!v.value.trim()) { v.classList.add('err'); setE('errVenue', 'Venue name is required.'); errs.push('venue'); }
  if (!dateIn.value) { addC('startDate', 'err'); setE('errStartDate', 'Start date is required.'); errs.push('date'); }
  if (!startIn.value) { addC('startTime', 'err'); setE('errStart', 'Start time is required.'); errs.push('start'); }
  if (!descTA.value.trim()) { descTA.classList.add('err'); setE('errDesc', 'Description is required.'); errs.push('desc'); }
  // Events don't store map coordinates, so an edit can't restore the pin: only new events need one
  if (!S.mapLoc && !S.editId) { addC('fullAddress', 'err'); setE('errLocation', 'Pin a location on the Algeria map.'); errs.push('loc'); }

  const seatsRaw = $('availableSeats').value.trim(), seats = Number(seatsRaw);
  if (!seatsRaw) { addC('availableSeats', 'err'); setE('errSeats', 'Enter how many seats are available.'); errs.push('seats'); }
  else if (!Number.isInteger(seats) || seats < 1 || seats > 100000) { addC('availableSeats', 'err'); setE('errSeats', 'Use a whole number between 1 and 100,000.'); errs.push('seats'); }

  if (!$('freeEventToggle').checked) {
    const price = Number($('ticketPrice').value), cur = $('currencySelect')?.value || 'DZD';
    const dzd = Math.round(price * (RATES_TO_DZD[cur] || 1));
    if (!$('ticketPrice').value || !(price > 0)) { addC('ticketPrice', 'err'); setE('errPrice', 'Enter a ticket price, or mark the event as free.'); errs.push('price'); }
    else if (dzd < MIN_PRICE_DZD) { addC('ticketPrice', 'err'); setE('errPrice', `Paid tickets must cost at least ${MIN_PRICE_DZD} DZD${cur !== 'DZD' ? ` (that's ${(MIN_PRICE_DZD / RATES_TO_DZD[cur]).toFixed(2)} ${cur})` : ''}, the Chargily minimum.`); errs.push('price'); }
  }

  // Date Logic Validations
  if (dateIn.value) {
    const now = new Date();
    // Normalize now to start of today for deadline comparison if no time provided
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sDate = new Date(dateIn.value + 'T' + (startIn.value || '00:00'));

    const rdDateVal = $('regDeadlineDate')?.value;
    if (rdDateVal) {
      const rdDate = new Date(rdDateVal + 'T' + ($('regDeadlineTime')?.value || '23:59'));
      if (rdDate < startOfToday) {
        addC('regDeadlineDate', 'err');
        toast('Registration deadline cannot be in the past.', 'error');
        errs.push('deadline_past');
      }
      if (sDate <= rdDate) {
        addC('startDate', 'err');
        addC('regDeadlineDate', 'err');
        toast('Event start date must be AFTER the registration deadline.', 'error');
        errs.push('date_conflict');
      }
    } else if (sDate < startOfToday && !S.editId) {
      // Only block past start dates for new events
      addC('startDate', 'err');
      toast('Event start date cannot be in the past.', 'error');
      errs.push('start_past');
    }

    const eDateVal = $('endDate')?.value;
    if (eDateVal) {
      const eDate = new Date(eDateVal + 'T' + ($('endTime')?.value || '23:59'));
      if (eDate <= sDate) {
        addC('endDate', 'err');
        toast('Event end date must be after the start date.', 'error');
        errs.push('end_conflict');
      }
    }
  }

  /* city ↔ map only when both are set */
  if (S.city && S.mapLoc) {
    const dist = haversine(S.mapLoc.lat, S.mapLoc.lng, S.city.lat, S.city.lng);
    const mc = (S.mapLoc.city || '').toLowerCase(), sc = S.city.name.toLowerCase();
    if (!mc.includes(sc) && !sc.includes(mc) && dist >= 80)
      toast(`⚠ Map pin is ~${Math.round(dist)} km from "${S.city.name}". Verify.`, 'warn');
  }
  return errs;
}

function scrollToErr() {
  const f = document.querySelector('.field-error:not(:empty)');
  if (f) f.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══ SAVE DRAFT ══ */
$('saveDraftBtn').addEventListener('click', () => {
  clearErrs();
  const t = $('eventTitle');
  if (!t.value.trim()) {
    t.classList.add('err');
    setE('errTitle', 'Event title is required to save a draft.');
    toast('Please add an Event Title before saving a draft.', 'error');
    scrollToErr();
    return;
  }
  try {
    localStorage.setItem('eventfy_draft', JSON.stringify({
      title: t.value,
      savedAt: new Date().toISOString()
    }));
  } catch (e) { }
  openModal('💾', 'Draft Saved!', `"${t.value}" has been saved.`, false, false);
});

/* ══ PUBLISH ══ */
$('publishBtn').addEventListener('click', async () => {
  const errs = validate();
  if (errs.length) { toast(`Fix ${errs.length} field${errs.length > 1 ? 's' : ''} before publishing.`, 'error'); scrollToErr(); return; }

  const publishBtn = $('publishBtn');
  const origText = publishBtn.textContent;
  publishBtn.disabled = true;
  publishBtn.textContent = S.editId ? 'Saving…' : 'Publishing…';
  publishBtn.style.opacity = '0.6';

  try {
    // Build start_date ISO from startDate + startTime
    const sDateVal = $('startDate').value;
    const sTimeVal = $('startTime').value || '00:00';
    const startDateISO = localDateTime(sDateVal, sTimeVal);

    // Build end_date ISO (optional)
    let endDateISO = null;
    const eDateVal = $('endDate')?.value;
    const eTimeVal = $('endTime')?.value || '23:59';
    if (eDateVal) endDateISO = localDateTime(eDateVal, eTimeVal);

    // Build registration_deadline ISO (optional)
    let regDeadlineISO = null;
    const rdDateVal = $('regDeadlineDate')?.value;
    const rdTimeVal = $('regDeadlineTime')?.value || '23:59';
    if (rdDateVal) regDeadlineISO = localDateTime(rdDateVal, rdTimeVal);

    // Build location string from city + venue
    const cityName = $('eventCity').value.trim();
    const venueName = $('venueName').value.trim();
    const locationStr = venueName + (cityName ? ', ' + cityName : '');

    // Get price & currency
    const isFree = $('freeEventToggle').checked;
    const price = isFree ? 0 : (parseFloat($('ticketPrice').value) || 0);
    const currency = $('currencySelect')?.value || 'DZD';

    // Get capacity
    const capacity = parseInt($('availableSeats').value, 10);

    const requiresApproval = $('requiresApprovalToggle')?.checked || false;

    const eventPayload = {
      title: $('eventTitle').value.trim(),
      description: $('eventDesc').value.trim(),
      location: locationStr,
      price: price,
      currency: currency,
      available_tickets: capacity,
      start_date: startDateISO,
      end_date: endDateISO,
      registration_deadline: regDeadlineISO,
      requires_approval: requiresApproval,
    };

    let resultEvent;

    if (S.editId) {
      // ── EDIT MODE: send PUT ──
      resultEvent = await updateEvent(S.editId, eventPayload);
    } else {
      // ── CREATE MODE: send POST ──
      resultEvent = await createEvent(eventPayload);
    }

    // Upload image if present
    const evId = resultEvent?.id || S.editId;
    S.publishedUrl = `${location.origin}${location.pathname.replace(/new%20Event\/.*$|new Event\/.*$/, '')}index.html#/event/${evId}`;
    if (S.image && evId) {
      try {
        await uploadEventImage(evId, S.image);
      } catch (imgErr) {
        console.warn('Image upload failed:', imgErr);
        toast('Event saved, but image upload failed.', 'warn');
      }
    }

    if (S.editId) {
      openModal('✅', 'Event Updated!', `"${$('eventTitle').value}" has been updated.`, false, false);
    } else {
      openModal('🚀', 'Event Published!', `"${$('eventTitle').value}" is now live in Algeria 🇩🇿`, true, true);
    }

  } catch (err) {
    console.error('Publish error:', err);
    toast(err.message || 'Failed to save event. Please try again.', 'error');
  } finally {
    publishBtn.disabled = false;
    publishBtn.textContent = origText;
    publishBtn.style.opacity = '1';
  }
});

  $('discardBtn').addEventListener('click', async () => {
    const isConfirmed = await window.showConfirmModal('Discard all changes?', 'Discard', 'Cancel', 'danger');
    if (isConfirmed) location.reload();
  });

/* ══ MODAL ══ */
function openModal(emoji, title, msg, confetti, showShare = true) {
  $('modalEmoji').textContent = emoji; $('modalTitle').textContent = title; $('modalMsg').textContent = msg;
  if (!showShare) hide($('modalShare')); else show($('modalShare'));
  if (confetti) spawnConfetti(); show($('modalBackdrop'));
}
$('modalClose').addEventListener('click', () => hide($('modalBackdrop')));
$('modalShare').addEventListener('click', () => {
  const url = S.publishedUrl || location.href;
  if (navigator.share) navigator.share({ title: $('eventTitle').value || 'My Event', url }).catch(() => { });
  else { navigator.clipboard?.writeText(url); toast('Event link copied!', 'success'); }
});
$('modalBackdrop').addEventListener('click', e => { if (e.target === $('modalBackdrop')) hide($('modalBackdrop')); });

function spawnConfetti() {
  const c = $('modalConfetti'); c.innerHTML = '';
  const cols = ['#f97316', '#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4'];
  for (let i = 0; i < 38; i++) {
    const p = document.createElement('div'); p.className = 'confetti-piece';
    p.style.cssText = [
      `left:${Math.random() * 100}%`, `top:${-(Math.random() * 30 + 5)}px`,
      `background:${cols[i % cols.length]}`,
      `--dur:${.9 + Math.random() * 1.3}s`, `--delay:${Math.random() * .65}s`,
      `transform:rotate(${Math.random() * 360}deg)`,
      `width:${6 + Math.random() * 5}px`, `height:${6 + Math.random() * 5}px`,
    ].join(';');
    c.appendChild(p);
  }
}

/* Event times are sent as local time (no Z): the API stores them as Algeria time. */
function localDateTime(date, time) { return `${date}T${(time || '00:00').slice(0, 5)}:00`; }

// Same rates and minimum as the API (backend/app/utils/currency.py)
const RATES_TO_DZD = { DZD: 1, USD: 230, EUR: 280, GBP: 300 };
const MIN_PRICE_DZD = 50;

/* ══ TOAST ══ */
function toast(msg, type = 'info') {
  const icons = { success: 'check_circle', error: 'error', warn: 'warning', info: 'info' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="material-symbols-outlined">${icons[type] || 'info'}</span><span></span>`;
  t.lastElementChild.textContent = msg;
  $('toastContainer').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 3800);
}

/* ══════════════════════════════════════════
   EDIT MODE — ?editId= parameter
   Fetches event data and pre-populates the form
══════════════════════════════════════════ */
(async function initEditMode() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('editId');
  if (!editId) return;

  S.editId = editId;

  // Update page title + button text
  document.title = 'Eventfy — Edit Event';
  const headerTitle = document.querySelector('.page-title, .hero-title, h1');
  if (headerTitle) headerTitle.textContent = 'Edit Event';
  const publishBtn = $('publishBtn');
  if (publishBtn) publishBtn.innerHTML = 'Save Changes <span class="material-symbols-outlined">save</span>';

  try {
    const ev = await fetchEventForEdit(editId);
    if (!ev) { toast('Event not found.', 'error'); return; }

    // Title
    if ($('eventTitle')) $('eventTitle').value = ev.title || '';

    // Description
    if ($('eventDesc')) {
      $('eventDesc').value = ev.description || '';
      $('eventDesc').dispatchEvent(new Event('input'));
    }

    // Dates — parse ISO strings into date + time inputs
    function fillDateTimeFields(isoStr, dateEl, timeEl) {
      if (!isoStr || !dateEl) return;
      // Stored times are already local ("2026-10-20T14:00:00"): read them as-is.
      // Going through Date/toISOString moved the date to UTC (the day before, near midnight).
      const m = String(isoStr).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
      if (!m) return;
      dateEl.value = m[1];
      if (timeEl) timeEl.value = m[2];
    }
    fillDateTimeFields(ev.start_date || ev.date, $('startDate'), $('startTime'));
    fillDateTimeFields(ev.end_date, $('endDate'), $('endTime'));
    fillDateTimeFields(ev.registration_deadline, $('regDeadlineDate'), $('regDeadlineTime'));

    // Location — split "Venue, City" format
    if (ev.location) {
      const parts = ev.location.split(',').map(s => s.trim());
      if ($('venueName')) $('venueName').value = parts[0] || '';
      if (parts[1] && $('eventCity')) {
        $('eventCity').value = parts[1];
        // Try to match known wilaya
        const found = ALGERIA_CITIES.find(c => c.name.toLowerCase() === parts[1].toLowerCase());
        if (found) {
          S.city = { name: found.name, country: 'Algeria', lat: found.lat, lng: found.lng };
        }
      }
    }

    // Price & free toggle
    if (ev.price === 0 || ev.price === null) {
      if ($('freeEventToggle')) {
        $('freeEventToggle').checked = true;
        $('freeEventToggle').dispatchEvent(new Event('change'));
      }
    } else {
      if ($('freeEventToggle')) $('freeEventToggle').checked = false;
      if ($('ticketPrice')) $('ticketPrice').value = ev.price;
      if ($('currencySelect') && ev.currency) {
        $('currencySelect').value = ev.currency;
        if ($('priceCurLabel')) $('priceCurLabel').textContent = ev.currency;
      }
      updatePrice();
    }

    // Capacity
    if ($('availableSeats') && ev.available_tickets) {
      $('availableSeats').value = ev.available_tickets;
    }

    // Requires approval toggle
    if ($('requiresApprovalToggle')) {
      $('requiresApprovalToggle').checked = !!ev.requires_approval;
      if (ev.requires_approval) {
        $('approvalToggleCard')?.classList.add('on');
      }
    }

    // Image preview — show existing image if any
    if (ev.image) {
      const prevImg = $('previewImg');
      if (prevImg) {
        prevImg.src = ev.image;
        hide($('uploadIdle'));
        show($('uploadPreview'));
      }
    }

    updateDur();
    toast('Event loaded for editing ✓', 'success');
  } catch (err) {
    console.error('Edit mode error:', err);
    toast('Could not load event data: ' + err.message, 'error');
  }
})();
