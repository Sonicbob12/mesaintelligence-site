// Outbound engine — one category per weekday, one city per week, N cold emails a day.
//
//   Mon HVAC · Tue restaurants · Wed dental · Thu legal · Fri follow-ups only.
//   Markets rotate one per campaign day through ROTATION (home markets Las Cruces + El Paso come up 3× per
//   21-day cycle; the rest of NM, Arizona and West Texas once). If the day's market runs dry before the cap,
//   the run overflows into the next market in the rotation. Day 1 = OUTBOUND_START (default 2026-10-19).
//   Businesses with no email (or no website) land on the daily CALL SHEET in the digest — Bobby dials those
//   himself. Never call them with an AI voice: AI voices are "artificial" under the TCPA (FCC, Feb 2024) and
//   need prior written consent for marketing calls.
//
// Daily run: Places search for the day's category in the day's city → skip anyone already contacted or
// suppressed → find an email on their website → run the FREE audit → Claude writes a short, specific
// email (their real rank + biggest gap) → send via Resend from OUTBOUND_FROM → log to `outreach`.
// The CTA is a /book link: booking a 15-min call auto-unlocks the Pro report (see api/book/create.js).
//
// Guardrails: OUTBOUND_DAILY_CAP (10), one email per business ever, unsubscribe link + List-Unsubscribe
// header, suppression table, physical address line (OUTBOUND_POSTAL_ADDRESS — set a real mailing address).
// OUTBOUND_ENABLED must be "1" or the run only logs what it WOULD do (dry run).

import { placeDetails, nearbyCompetitors, competitorCategory } from "./places.js";
import { runAudit, derived, cacheable, saveAudit, actionPlan, savePlan } from "./audit.js";
import { runModelCollect } from "./anthropic.js";
import { hasDB, id, now } from "./db.js";
import { localDate } from "./time.js";

const TZ = "America/Denver";
// Categories. Mon–Thu default to the trades (OUTBOUND_SCHEDULE="hvac,plumbing,electrical,roofing" overrides the
// weekday order; any key from CATEGORIES). The non-trade categories stay available but are off the default schedule.
export const CATEGORIES = {
  hvac: { key: "hvac", label: "HVAC", noun: "HVAC contractor", plural: "HVAC companies", match: /hvac|heating|air|cool|furnace|refrigera|mechanical/i, search: "HVAC contractor", queries: ["HVAC contractor", "air conditioning repair", "heating and cooling service", "refrigerated air installation", "furnace repair"], angle: "after-hours and on-the-job calls — every call that rings out on a hot afternoon is a service ticket somebody else gets" },
  plumbing: { key: "plumbing", label: "Plumbing", noun: "plumber", plural: "plumbing companies", match: /plumb|rooter|drain|sewer|water heater|gas line/i, search: "plumber", queries: ["plumber", "plumbing company", "drain cleaning", "water heater repair", "emergency plumber"], angle: "emergency calls — a burst pipe at 9 PM goes to whoever answers, and the customer never calls the second number" },
  electrical: { key: "electrical", label: "Electrical", noun: "electrician", plural: "electrical contractors", match: /electric|wiring|lighting/i, search: "electrician", queries: ["electrician", "electrical contractor", "residential electrician", "commercial electrician", "electrical repair"], angle: "calls that come in while you're on a ladder — the ones that ring out become the other guy's estimate" },
  roofing: { key: "roofing", label: "Roofing", noun: "roofing contractor", plural: "roofing companies", match: /roof|gutter|siding|stucco/i, search: "roofing contractor", queries: ["roofing contractor", "roof repair", "roofing company", "stucco contractor", "gutter installation"], angle: "storm-week calls — after a hail or wind day the phone rings for three days and every missed one is a roof somebody else sells" },
  landscaping: { key: "landscaping", label: "Landscaping", noun: "landscaping company", plural: "landscaping companies", match: /landscap|lawn|tree|irrigat|yard|xeriscap|sprinkler/i, search: "landscaping company", queries: ["landscaping company", "landscaper", "lawn care service", "tree service", "irrigation repair"], angle: "spring and fall call volume — owners are on the mower, the phone rings in the truck, and the estimate goes to whoever picked up" },
  contractor: { key: "contractor", label: "Contractors", noun: "general contractor", plural: "contractors", match: /contract|construct|remodel|handyman|builder|concrete|paving|fence|painting|garage door/i, search: "general contractor", queries: ["general contractor", "remodeling contractor", "concrete contractor", "fence company", "handyman service", "painting contractor"], angle: "estimate requests — homeowners call three contractors and go with the first one who answers and shows up" },
  restaurant: { key: "restaurant", label: "Restaurants", noun: "restaurant", plural: "restaurants", match: /restaurant|cafe|café|grill|bar\b|diner|steak|pizza|taco|food|bistro|eatery|coffee|bakery|kitchen|cantina|brewery|bbq|barbecue/i, search: "restaurant", queries: ["restaurant", "mexican restaurant", "family restaurant", "steakhouse", "cafe", "bar and grill"], angle: "hosting and reservations — people decide where to eat from the listing, the photos and whether they can book in two taps" },
  dental: { key: "dental", label: "Dental", noun: "dentist", plural: "dental offices", match: /dent|orthodont|endodont|periodont|oral|smile/i, search: "dentist", queries: ["dentist", "dental clinic", "family dentistry", "orthodontist", "pediatric dentist", "cosmetic dentist"], angle: "new-patient intake — the practice that answers first and books online wins the patient" },
  legal: { key: "legal", label: "Legal", noun: "attorney", plural: "law firms", match: /law|attorney|lawyer|legal/i, search: "law firm", queries: ["law firm", "personal injury lawyer", "family law attorney", "criminal defense attorney", "immigration lawyer", "estate planning attorney"], angle: "client intake — a potential client who can't reach you in the first hour calls the next firm on the list" },
};
const DEFAULT_WEEK = ["hvac", "plumbing", "electrical", "roofing"]; // Mon–Thu; landscaping + contractor rotate in via OUTBOUND_SCHEDULE
function weekSchedule(env) {
  const keys = String(env.OUTBOUND_SCHEDULE || "").split(",").map((k) => k.trim()).filter((k) => CATEGORIES[k]);
  const list = keys.length ? keys : DEFAULT_WEEK;
  return { mon: list[0 % list.length], tue: list[1 % list.length], wed: list[2 % list.length], thu: list[3 % list.length] };
}
// Kept for older callers (admin panel): the default Mon–Thu map.
export const SCHEDULE = { mon: CATEGORIES.hvac, tue: CATEGORIES.plumbing, wed: CATEGORIES.electrical, thu: CATEGORIES.roofing };
const C = (latitude, longitude) => ({ latitude, longitude });
const N = (query, lat, lng) => ({ query, center: C(lat, lng) });
// local: Bobby can honestly say "here in <area>". tz: the market's own time zone (sends happen ~7–4 Mountain).
export const MARKETS = {
  "las-cruces": { key: "las-cruces", label: "Las Cruces", query: "Las Cruces, NM", center: C(32.3199, -106.7637), local: "here in Las Cruces",
    nearby: [N("Mesilla, NM", 32.2701, -106.8006), N("Anthony, NM", 32.004, -106.6056), N("Santa Teresa, NM", 31.8559, -106.6392), N("Sunland Park, NM", 31.7965, -106.5799), N("Hatch, NM", 32.6648, -107.1531)] },
  "el-paso": { key: "el-paso", label: "El Paso", query: "El Paso, TX", center: C(31.7619, -106.485), local: "just up the road in Las Cruces",
    nearby: [N("Horizon City, TX", 31.6929, -106.2072), N("Socorro, TX", 31.6546, -106.3033), N("Canutillo, TX", 31.9118, -106.5992), N("Anthony, TX", 31.9993, -106.605)] },
  albuquerque: { key: "albuquerque", label: "Albuquerque", query: "Albuquerque, NM", center: C(35.0844, -106.6504), local: "down in Las Cruces",
    nearby: [N("Los Lunas, NM", 34.8062, -106.7334), N("Bernalillo, NM", 35.3, -106.5511), N("Corrales, NM", 35.2378, -106.6067)] },
  "rio-rancho": { key: "rio-rancho", label: "Rio Rancho", query: "Rio Rancho, NM", center: C(35.2328, -106.663), local: "down in Las Cruces", nearby: [N("Placitas, NM", 35.3067, -106.4245)] },
  "santa-fe": { key: "santa-fe", label: "Santa Fe", query: "Santa Fe, NM", center: C(35.687, -105.9378), local: "down in Las Cruces", nearby: [N("Española, NM", 35.9911, -106.0806), N("Los Alamos, NM", 35.8881, -106.3069)] },
  roswell: { key: "roswell", label: "Roswell", query: "Roswell, NM", center: C(33.3943, -104.523), local: "over in Las Cruces", nearby: [N("Artesia, NM", 32.8423, -104.4033), N("Carlsbad, NM", 32.4207, -104.2288), N("Hobbs, NM", 32.7026, -103.136)] },
  alamogordo: { key: "alamogordo", label: "Alamogordo", query: "Alamogordo, NM", center: C(32.8995, -105.9603), local: "over the pass in Las Cruces", nearby: [N("Tularosa, NM", 33.0737, -106.0186), N("Ruidoso, NM", 33.3317, -105.673)] },
  farmington: { key: "farmington", label: "Farmington", query: "Farmington, NM", center: C(36.7281, -108.2187), local: "in Las Cruces", nearby: [N("Aztec, NM", 36.8222, -107.9928), N("Bloomfield, NM", 36.7111, -107.9845)] },
  deming: { key: "deming", label: "Deming", query: "Deming, NM", center: C(32.2687, -107.7586), local: "next door in Las Cruces", nearby: [N("Lordsburg, NM", 32.3504, -108.7087), N("Columbus, NM", 31.8276, -107.6403)] },
  "silver-city": { key: "silver-city", label: "Silver City", query: "Silver City, NM", center: C(32.7701, -108.2803), local: "over in Las Cruces", nearby: [N("Bayard, NM", 32.7615, -108.1306)] },
  "t-or-c": { key: "t-or-c", label: "Truth or Consequences", query: "Truth or Consequences, NM", center: C(33.1284, -107.2528), local: "down the road in Las Cruces", nearby: [N("Elephant Butte, NM", 33.1487, -107.1847), N("Socorro, NM", 34.0584, -106.8914)] },
  tucson: { key: "tucson", label: "Tucson", query: "Tucson, AZ", center: C(32.2226, -110.9747), local: null, nearby: [N("Oro Valley, AZ", 32.3909, -110.9665), N("Marana, AZ", 32.4367, -111.2257), N("Sahuarita, AZ", 31.9576, -110.9556)] },
  phoenix: { key: "phoenix", label: "Phoenix", query: "Phoenix, AZ", center: C(33.4484, -112.074), local: null,
    nearby: [N("Mesa, AZ", 33.4152, -111.8315), N("Chandler, AZ", 33.3062, -111.8413), N("Gilbert, AZ", 33.3528, -111.789), N("Tempe, AZ", 33.4255, -111.94), N("Glendale, AZ", 33.5387, -112.186), N("Scottsdale, AZ", 33.4942, -111.9261)] },
  midland: { key: "midland", label: "Midland", query: "Midland, TX", center: C(31.9973, -102.0779), local: null, nearby: [] },
  odessa: { key: "odessa", label: "Odessa", query: "Odessa, TX", center: C(31.8457, -102.3676), local: null, nearby: [] },
  lubbock: { key: "lubbock", label: "Lubbock", query: "Lubbock, TX", center: C(33.5779, -101.8552), local: null, nearby: [N("Wolfforth, TX", 33.5059, -102.0091)] },
  "san-angelo": { key: "san-angelo", label: "San Angelo", query: "San Angelo, TX", center: C(31.4638, -100.437), local: null, nearby: [] },
};
// 21 entries (odd, so every market meets every weekday category over time). Home markets 3× each.
// Home markets 4× each per 19-day cycle, the rest of southern NM + West Texas once, ABQ/Santa Fe once (they're a
// 3–4 hour drive). Phoenix/Tucson/Farmington/Rio Rancho stay defined for OUTBOUND_MARKETS but are off by default.
export const ROTATION = ["midland", "deming", "lubbock", "roswell", "las-cruces", "el-paso", "las-cruces", "alamogordo", "el-paso", "odessa",
  "las-cruces", "silver-city", "el-paso", "albuquerque", "las-cruces", "t-or-c", "el-paso", "san-angelo", "santa-fe"];
// Optional override: OUTBOUND_MARKETS = comma list of market keys to rotate through instead.
function rotation(env) {
  const list = String(env.OUTBOUND_MARKETS || "").split(",").map((x) => x.trim()).filter((k) => MARKETS[k]);
  return list.length ? list : ROTATION;
}
export const CITIES = [MARKETS["las-cruces"], MARKETS["el-paso"]]; // kept for older callers

export function planFor(env, date = new Date()) {
  const d = localDate(date, TZ);
  const start = env.OUTBOUND_START || "2026-10-19";
  const dayMs = 86400000;
  const days = Math.round((Date.parse(`${d.iso}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / dayMs);
  const weeks = Math.floor(days / 7);
  // Campaign day index: counts Mon–Thu only, so each category day advances the market rotation by one.
  const full = Math.max(0, weeks) * 4;
  const wdIdx = { mon: 0, tue: 1, wed: 2, thu: 3 }[d.weekday];
  const dayIdx = full + (wdIdx ?? 3);
  const rot = rotation(env);
  const city = MARKETS[rot[((dayIdx % rot.length) + rot.length) % rot.length]];
  const overflow = [1, 2].map((k) => MARKETS[rot[(dayIdx + k) % rot.length]]).filter((m) => m && m.key !== city.key);
  const catKey = weekSchedule(env)[d.weekday];
  const cat = catKey ? CATEGORIES[catKey] : null;
  return { day: d.iso, weekday: d.weekday, week: weeks + 1, dayIdx, city, overflow, category: cat, mode: cat ? "daily" : d.weekday === "fri" ? "followups" : "off" };
}

// ---------- finding an email on the business website ----------
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_EMAIL = /(@doe\.com|john@doe|jane@doe|@domain\.com|@email\.com|@yourdomain|@yoursite|@yourcompany|@company\.com|@website\.com|@mysite|@test\.com|@sample|youremail|your-?email|yourname|first\.?last@|name@|user@|test@|email@email|@mail\.com$|@xxx|example|sentry|wixpress|godaddy|squarespace|wordpress|cloudflare|\.png|\.jpg|\.gif|\.svg|\.webp|noreply|no-reply|donotreply|privacy@|abuse@|legal@|press@|careers@|jobs@|hr@|billing@|accounting@|support@)/i;
async function fetchText(url, ms = 6000) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(ms), headers: { "user-agent": "Mozilla/5.0 (compatible; MesaAudit/1.0; +https://mesaintelligence.ai)" } });
    if (!res.ok) return "";
    return (await res.text()).slice(0, 1_200_000);
  } catch { return ""; }
}
// Cloudflare's email obfuscation: <a href="/cdn-cgi/l/email-protection#HEX" data-cfemail="HEX">
function decodeCf(hex) {
  try { const k = parseInt(hex.slice(0, 2), 16); let out = ""; for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); return out; } catch { return ""; }
}
function emailsIn(html) {
  const out = [];
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]+)"|email-protection#([0-9a-f]+)/gi)) { const e = decodeCf(m[1] || m[2]); if (e.includes("@")) out.push({ e, w: 3 }); }
  const text = html
    .replace(/&#64;|&commat;|%40/g, "@").replace(/&#46;|&period;/g, ".")
    .replace(/\s*(?:\[|\(|\{)\s*at\s*(?:\]|\)|\})\s*/gi, "@").replace(/\s*(?:\[|\(|\{)\s*dot\s*(?:\]|\)|\})\s*/gi, ".");
  for (const m of text.matchAll(/"email"\s*:\s*"([^"]+@[^"]+)"/gi)) out.push({ e: m[1], w: 3 }); // JSON-LD
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) out.push({ e: decodeURIComponent(m[1]), w: 3 });
  for (const m of text.match(EMAIL_RE) || []) out.push({ e: m, w: 1 });
  return out;
}
function contactLinks(html, origin) {
  const links = new Set();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)) {
    const href = m[1], label = m[2].replace(/<[^>]+>/g, "");
    if (!/contact|about|get[-\s]?in[-\s]?touch|reach[-\s]?us|quote|estimate/i.test(href + " " + label)) continue;
    try { const u = new URL(href, origin); if (u.origin === origin) links.add(u.origin + u.pathname.replace(/\/$/, "")); } catch {}
  }
  return [...links].slice(0, 4);
}
export async function findEmail(website) {
  if (!website) return null;
  let origin, given; try { const u = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`); origin = u.origin; given = u.toString(); } catch { return null; }
  const found = new Map();
  const add = (list) => { for (const { e, w } of list) { const x = e.toLowerCase().trim().replace(/^mailto:/, ""); if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x) || BAD_EMAIL.test(x) || x.length > 60) continue; found.set(x, (found.get(x) || 0) + w); } };
  const home = await fetchText(given);
  if (home) add(emailsIn(home));
  if (!found.size) {
    const pages = [...new Set([...(home ? contactLinks(home, origin) : []), `${origin}/contact`, `${origin}/contact-us`, `${origin}/contact.html`, `${origin}/about`, `${origin}/about-us`])].filter((u) => u !== given.replace(/\/$/, ""));
    for (const u of pages.slice(0, 6)) {
      const html = await fetchText(u, 5000);
      if (!html) continue;
      add(emailsIn(html));
      if (found.size) break;
    }
  }
  if (!found.size) return null;
  const host = origin.replace(/^https?:\/\/(www\.)?/, "");
  // Prefer an address on the business's own domain, then the one that appeared most / as mailto.
  return [...found.entries()].sort((a, b) => (b[0].endsWith(`@${host}`) - a[0].endsWith(`@${host}`)) || b[1] - a[1])[0][0];
}

// ---------- candidate businesses for the day ----------
// Streams businesses for the day's category: every query variant in the main city (2 pages each), then the
// nearby towns. Lazy — the caller stops pulling once the daily cap is met, so only the searches needed are paid for.
export async function* streamCandidates(env, plan, { maxSearches = Number(env.OUTBOUND_MAX_SEARCHES || 14), resume = true } = {}) {
  const seen = new Set();
  const queries = plan.category.queries?.length ? plan.category.queries : [plan.category.search];
  const areas = [
    { query: plan.city.query, center: plan.city.center, pages: 2, market: plan.city.key },
    ...(plan.city.nearby || []).map((n) => ({ ...n, pages: 1, market: plan.city.key })),
    ...(plan.overflow || []).map((m) => ({ query: m.query, center: m.center, pages: 1, market: m.key })),
  ];
  const pairs = areas.flatMap((area) => queries.map((q) => ({ area, q })));
  // Daily cursor (in rate_limits): how many query/area pairs earlier runs today fully walked, so the hourly top-ups
  // resume instead of re-paying for the same searches.
  const cursorKey = `outbound-cursor:${plan.day}`;
  let done = 0;
  if (resume && hasDB(env)) {
    try { const r = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE k = ?").bind(cursorKey).first(); done = r ? Number(r.count) || 0 : 0; } catch { done = 0; }
  }
  const markDone = async () => {
    if (!resume || !hasDB(env)) return;
    try { await env.DB.prepare("INSERT INTO rate_limits (k, window_start, count) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET count = ?3, window_start = ?2").bind(cursorKey, now(), done).run(); } catch {}
  };
  let searches = 0;
  for (let i = done; i < pairs.length; i++) {
    const { area, q } = pairs[i];
    let token = null;
    for (let page = 0; page < area.pages; page++) {
      if (searches >= maxSearches) return;
      searches++;
      let data;
      try { data = await placesText(env, `${q} in ${area.query}`, area.center, 20, token || undefined); }
      catch (e) { console.error("places", q, area.query, e?.message || e); break; }
      for (const p of data.places || []) {
        if (seen.has(p.id) || (p.businessStatus && p.businessStatus !== "OPERATIONAL")) continue;
        seen.add(p.id);
        yield { id: p.id, name: p.displayName?.text || "", website: p.websiteUri || "", phone: p.nationalPhoneNumber || "", rating: p.rating ?? null, reviews: p.userRatingCount || 0, address: p.formattedAddress || "", query: `${q} in ${area.query}`, market: area.market, area: area.query };
      }
      token = data.nextPageToken;
      if (!token) break;
    }
    done = i + 1;
    await markDone();
  }
}

// Kept for callers that want a plain list (first page of the main query).
export async function findCandidates(env, plan, max = 40) {
  const out = [];
  for await (const c of streamCandidates(env, plan, { maxSearches: 2, resume: false })) { out.push(c); if (out.length >= max) break; }
  return out;
}
async function placesText(env, textQuery, center, pageSize, pageToken) {
  const res = await fetch(`${env.PLACES_BASE_URL || "https://places.googleapis.com"}/v1/places:searchText`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.formattedAddress,places.businessStatus,nextPageToken" },
    body: JSON.stringify({ textQuery, pageSize, regionCode: "us", languageCode: "en", locationBias: { circle: { center, radius: 20000 } }, ...(pageToken ? { pageToken } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Places ${res.status}: ${String(data?.error?.message || "").slice(0, 120)}`);
  return data;
}

// ---------- the email ----------
export function bookLink(env, auditId, shareKey, outreachId) {
  const base = (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
  return `${base}/book?a=${auditId}&k=${shareKey}&o=${outreachId}`;
}
export function reportLink(env, auditId, shareKey) {
  const base = (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
  return `${base}/audit/${auditId}?k=${shareKey}`;
}
export function unsubLink(env, token) {
  const base = (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
  return `${base}/api/outbound/unsubscribe?t=${token}`;
}

export async function composeEmail(env, { plan, biz, audit, links }) {
  const rank = audit.visibility?.queries?.[0];
  const top = audit.issues.slice(0, 3);
  const facts = {
    business: biz.name, business_type: plan.category.label, city: (MARKETS[biz.market] || plan.city).label,
    bobby_location: (MARKETS[biz.market] || plan.city).local ? `Bobby is local — he can say he's ${(MARKETS[biz.market] || plan.city).local}` : "Bobby is based in Las Cruces, New Mexico and works with businesses across the Southwest — do not claim he is local to them",
    overall_score: audit.score, grade: audit.grade,
    rank: rank ? { search: rank.label, position: rank.position, of: rank.results, leader: rank.leader?.name, leader_reviews: rank.leader?.reviewCount } : null,
    reviews: audit.place.reviewCount, rating: audit.place.rating, local_median_reviews: audit.competitors.medianReviews,
    biggest_problems: top.map((i) => `${i.label}: ${i.detail}`),
    has_website: audit.hasWebsite, website_score: audit.websiteScore,
    industry_angle: plan.category.angle,
    offer: `An AI phone line that answers when the owner can't (nights, weekends, on a job), books the work into their calendar, texts the customer a confirmation, and emails the owner a summary of every call. Free for ${env.PLAN_TRIAL_DAYS ?? 14} days on a number they can call right now; if it hasn't caught a job they'd have missed, they owe nothing. After that $${env.PLAN_PRICE_USD || 249}/month, cancel any time.`,
  };
  const system = [
    "You write short cold emails for Bobby Lloyd, founder of Mesa Intelligence in Las Cruces NM. Bobby ran a landscaping company and works in construction; he builds an AI phone line for trades businesses. Follow bobby_location exactly when describing where Bobby is.",
    "Write to the owner. Plain text. 80-120 words. No subject line in the body. No bullet points, no markdown, no exclamation marks, no hype words (game-changer, skyrocket, unlock, revolutionize). Sound like a tradesman who built something useful, not a marketer.",
    "Structure: 1) one sentence with their most striking real number from the audit (rank, reviews gap, or no website) — specific, not flattering; mention the free summary once with the placeholder {REPORT_LINK}. 2) one sentence on what that costs them in missed calls, in the words of industry_angle. 3) two sentences on the offer: what the line does and the free trial, taken from `offer` — then the placeholder {BOOK_LINK} as the way to start (a 15-minute call where Bobby sets it up on a number they can hear). 4) one line: who Bobby is (per bobby_location, mention he ran a landscaping company). 5) sign-off: Bobby.",
    "Use only the facts given. Never invent numbers. If rank.position is null say they do not appear in the top 20 for that search.",
    'Respond with JSON only: {"subject": "max 7 words, specific, lowercase except names, no clickbait", "body": "the email with {REPORT_LINK} and {BOOK_LINK} placeholders"}',
  ].join("\n");
  let subject = "", body = "";
  try {
    if (!env.ANTHROPIC_API_KEY) throw new Error("no model");
    const { text } = await runModelCollect({ env, system, messages: [{ role: "user", content: JSON.stringify(facts, null, 1) }], maxTokens: 500 });
    const m = /\{[\s\S]*\}/.exec(text);
    const j = m ? JSON.parse(m[0]) : null;
    subject = String(j?.subject || "").slice(0, 90); body = String(j?.body || "");
  } catch (e) { console.error("compose", e?.message || e); }
  if (!body || !body.includes("{BOOK_LINK}")) {
    const r = rank ? (rank.position ? `you're #${rank.position} of ${rank.results} when someone searches "${rank.label}"` : `you don't show up in the top 20 when someone searches "${rank.label}"`) : `your listing scores ${audit.score}/100`;
    subject = subject || `${biz.name} — ${rank?.position ? `#${rank.position}` : "not in the top 20"} for "${rank?.label || plan.category.search}"`;
    const mk = MARKETS[biz.market] || plan.city;
    const who = mk.local ? `I run Mesa Intelligence ${mk.local}` : "I run Mesa Intelligence out of Las Cruces, NM";
    const trial = env.PLAN_TRIAL_DAYS ?? 14;
    body = `Hi,\n\nI ran a quick audit on ${biz.name}'s Google listing this morning: ${r}${audit.competitors.medianReviews ? `, with ${audit.place.reviewCount} reviews against a local median of ${audit.competitors.medianReviews}` : ""}. The free summary is here: {REPORT_LINK}\n\nFor ${plan.category.plural} the bigger leak is usually ${plan.category.angle.split(" — ")[0]}.\n\nI built an AI phone line for that: it answers when you can't, books the job into your calendar, texts the customer a confirmation and emails you a summary of every call. It's free for ${trial} days on a number you can call right now, and if it hasn't caught a job you'd have missed, you owe nothing. Fifteen minutes and I'll have it live for you: {BOOK_LINK}\n\n${who}. I ran a landscaping company before this, so I know what the phone does when you're on a job.\n\nBobby`;
  }
  body = body.replace(/\{REPORT_LINK\}/g, links.report).replace(/\{BOOK_LINK\}/g, links.book);
  const footer = `\n\n—\nBobby Lloyd · Mesa Intelligence LLC · ${env.OUTBOUND_POSTAL_ADDRESS || "Las Cruces, NM"} · (575) 254-1185\nNot interested? ${links.unsub} and you won't hear from me again.`;
  return { subject, body: body.trim() + footer };
}

export async function sendEmail(env, { to, subject, text, unsub, replyTo }) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const from = env.OUTBOUND_FROM || "Bobby Lloyd <hello@mesaintelligence.ai>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo || env.OUTBOUND_REPLY_TO || env.LEAD_TO || undefined, subject, text,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${String(data?.message || data?.error || "").slice(0, 160)}`);
  return data.id || null;
}

// ---------- storage ----------
async function alreadyContacted(env, placeId, retryDays = 14) {
  const r = await env.DB.prepare("SELECT id, status, email, audit_id, subject, body_text, unsub_token, updated_at FROM outreach WHERE place_id = ?").bind(placeId).first();
  if (!r) return null;
  if ((r.status === "skipped" || r.status === "error") && r.updated_at < now() - retryDays * 86400) {
    await env.DB.prepare("DELETE FROM outreach WHERE id = ?").bind(r.id).run(); // re-evaluate from scratch
    return null;
  }
  return r;
}
async function suppressed(env, email) {
  if (!email) return false;
  const r = await env.DB.prepare("SELECT 1 AS x FROM suppression WHERE email = ?").bind(email.toLowerCase()).first();
  return Boolean(r);
}
async function insertOutreach(env, o) {
  const t = now();
  try {
    await env.DB.prepare(`INSERT INTO outreach (id, place_id, audit_id, run_id, category, city, business, email, website, phone, score, grade, rank_label, rank_position, status, skip_reason, subject, body_text, unsub_token, sent_at, last_error, created_at, updated_at, rating, reviews)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?22,?23,?24)`)
      .bind(o.id, o.place_id, o.audit_id || null, o.run_id, o.category, o.city, o.business || null, o.email || null, o.website || null, o.phone || null, o.score ?? null, o.grade || null, o.rank_label || null, o.rank_position ?? null, o.status, o.skip_reason || null, o.subject || null, o.body_text || null, o.unsub_token || null, o.sent_at || null, o.last_error || null, t, o.rating ?? null, o.reviews ?? null).run();
    return;
  } catch (e) { if (!/no column|has no column/i.test(String(e?.message || e))) throw e; } // migration 008 not applied yet
  await env.DB.prepare(`INSERT INTO outreach (id, place_id, audit_id, run_id, category, city, business, email, website, phone, score, grade, rank_label, rank_position, status, skip_reason, subject, body_text, unsub_token, sent_at, last_error, created_at, updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?22)`)
    .bind(o.id, o.place_id, o.audit_id || null, o.run_id, o.category, o.city, o.business || null, o.email || null, o.website || null, o.phone || null, o.score ?? null, o.grade || null, o.rank_label || null, o.rank_position ?? null, o.status, o.skip_reason || null, o.subject || null, o.body_text || null, o.unsub_token || null, o.sent_at || null, o.last_error || null, t).run();
}
export async function setStatus(env, outreachId, status, extra = {}) {
  const sets = ["status = ?2", "updated_at = ?3"]; const binds = [outreachId, status, now()];
  for (const [k, v] of Object.entries(extra)) { binds.push(v); sets.push(`${k} = ?${binds.length}`); }
  await env.DB.prepare(`UPDATE outreach SET ${sets.join(", ")} WHERE id = ?1`).bind(...binds).run();
}
export async function suppress(env, email, reason) {
  if (!hasDB(env) || !email) return;
  await env.DB.prepare("INSERT OR REPLACE INTO suppression (email, reason, at) VALUES (?1, ?2, ?3)").bind(email.toLowerCase(), reason, now()).run();
  await env.DB.prepare("UPDATE outreach SET status = 'unsubscribed', updated_at = ?2 WHERE lower(email) = ?1 AND status IN ('sent','followup_sent','queued')").bind(email.toLowerCase(), now()).run();
}

// A business is worth emailing when at least one of these is true (OUTBOUND_GAP_SCORE 75, OUTBOUND_GAP_RANK 5):
// score under the threshold · not in the top N for its trade · fewer reviews than the local median · no website.
export function listingGap(env, audit) {
  if (env.OUTBOUND_GAP_FILTER === "0") return "filter off";
  const maxScore = Number(env.OUTBOUND_GAP_SCORE || 75), topN = Number(env.OUTBOUND_GAP_RANK || 5);
  const rank = audit.visibility?.queries?.[0];
  if (!audit.hasWebsite) return "no website";
  if (audit.score < maxScore) return `score ${audit.score}`;
  if (rank && (rank.position == null || rank.position > topN)) return rank.position == null ? "not in top 20" : `#${rank.position}`;
  const med = audit.competitors?.medianReviews;
  if (med != null && audit.place.reviewCount < med) return `${audit.place.reviewCount} reviews vs median ${med}`;
  return null;
}

// ---------- the daily run ----------
// Cloudflare caps outbound requests per invocation (50 on the free Workers plan, far more on Workers Paid).
// Count our own fetches and stop before starting a business we might not finish; the next tick resumes.
const PER_BUSINESS_RESERVE = 20;
function countFetches() {
  const real = globalThis.fetch;
  const c = { n: 0, restore: () => { if (globalThis.fetch === wrapped) globalThis.fetch = real; } };
  const wrapped = (...a) => { c.n++; return real(...a); };
  globalThis.fetch = wrapped;
  return c;
}
const isLimitError = (e) => /too many subrequests|subrequest/i.test(String(e?.message || e));

export async function runDaily(env, { date = new Date(), limit, dryRun, timeBudgetMs, subrequestLimit } = {}) {
  const t0 = Date.now();
  const deadline = t0 + Number(timeBudgetMs || env.OUTBOUND_TIME_BUDGET_MS || 25000);
  const subLimit = Number(subrequestLimit || env.OUTBOUND_SUBREQUEST_LIMIT || 45);
  const fc = countFetches();
  try { return await runDailyInner(env, { date, limit, dryRun, deadline, subLimit, fc }); }
  finally { fc.restore(); }
}

async function runDailyInner(env, { date, limit, dryRun, deadline, subLimit, fc }) {
  if (!hasDB(env)) throw new Error("D1 not bound");
  const plan = planFor(env, date);
  const live = env.OUTBOUND_ENABLED === "1" && !dryRun;
  const cap = Number(limit || env.OUTBOUND_DAILY_CAP || 10);
  const run = { id: id("run"), day: plan.day, mode: plan.mode, category: plan.category?.key || null, city: plan.city.key, found: 0, emailed: 0, skipped: 0, followups: 0, errors: [], started_at: now() };
  const log = [];
  if (plan.mode !== "daily") { run.notes = `No category scheduled on ${plan.weekday}`; await saveRun(env, run); return { plan, run, log, live }; }
  if (!env.GOOGLE_PLACES_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY not set");

  // Don't double-send if the cron fires twice.
  const already = await env.DB.prepare("SELECT COUNT(*) AS n FROM outreach WHERE run_id IN (SELECT id FROM outbound_runs WHERE day = ?1 AND mode = 'daily') AND status IN ('sent')").bind(plan.day).first();
  let budget = Math.max(0, cap - Number(already?.n || 0));

  if (budget <= 0) { run.notes = "daily cap already reached"; await saveRun(env, run); return { plan, run, log, live }; }

  for await (const biz of streamCandidates(env, plan)) {
    if (budget <= 0) break;
    if (Date.now() > deadline) { run.notes = `time budget reached with ${budget} left — the hourly tick continues`; break; }
    if (fc.n + PER_BUSINESS_RESERVE > subLimit) { run.notes = `request budget reached (${fc.n}/${subLimit}) with ${budget} left — the hourly tick continues`; break; }
    run.found++;
    const prior = await alreadyContacted(env, biz.id, Number(env.OUTBOUND_RETRY_DAYS || 14));
    if (prior && prior.status === "queued" && prior.email && prior.body_text) {
      // Drafted by a dry run: send it now (live) or leave it queued.
      if (live) {
        try {
          if (await suppressed(env, prior.email)) { await setStatus(env, prior.id, "unsubscribed"); continue; }
          await sendEmail(env, { to: prior.email, subject: prior.subject, text: prior.body_text, unsub: unsubLink(env, prior.unsub_token) });
          await setStatus(env, prior.id, "sent", { sent_at: now(), run_id: run.id });
          run.emailed++; budget--; log.push({ business: biz.name, email: prior.email, status: "sent (from dry-run draft)", subject: prior.subject });
        } catch (e) { run.errors.push(`${biz.name}: ${String(e?.message || e).slice(0, 160)}`); }
      } else log.push({ business: biz.name, email: prior.email, status: "queued (dry run, already drafted)", subject: prior.subject });
      continue;
    }
    if (prior) { log.push({ business: biz.name, status: "skipped", reason: `already ${prior.status}` }); continue; }
    const base = { id: id("ob"), place_id: biz.id, run_id: run.id, category: plan.category.key, city: biz.market || plan.city.key, business: biz.name, website: biz.website, phone: biz.phone, rating: biz.rating, reviews: biz.reviews };
    const skip = async (reason) => { run.skipped++; log.push({ business: biz.name, status: "skipped", reason }); await insertOutreach(env, { ...base, status: "skipped", skip_reason: reason }); };
    if (!biz.website) { await skip("no website on listing"); continue; }
    let email = null;
    try { email = await findEmail(biz.website); } catch {}
    if (!email) { await skip("no email found on website"); continue; }
    if (await suppressed(env, email)) { await skip("suppressed"); continue; }

    try {
      const audit = await runAudit(env, biz.id, { category: plan.category.noun, categoryMatch: plan.category.match });
      const data = derived(audit);
      // Only email businesses with a real gap. The #1 shop with 300 reviews doesn't need us, and emailing it burns the domain.
      const gap = listingGap(env, audit);
      if (!gap) {
        const rec0 = await saveAudit(env, { place_id: biz.id, query: biz.name, source: "outbound", score: audit.score, grade: audit.grade, data, full: cacheable(audit) }).catch(() => null);
        await insertOutreach(env, { ...base, audit_id: rec0?.id || null, email, score: audit.score, grade: audit.grade, status: "skipped", skip_reason: `strong listing (score ${audit.score}, ${audit.visibility?.queries?.[0]?.position ? `#${audit.visibility.queries[0].position}` : "unranked"})` });
        run.skipped++; log.push({ business: biz.name, status: "skipped", reason: "strong listing" });
        continue;
      }
      const rec = await saveAudit(env, { place_id: biz.id, query: biz.name, source: "outbound", score: audit.score, grade: audit.grade, data, full: cacheable(audit) });
      actionPlan(env, data.facts).then((p) => savePlan(env, rec.id, p)).catch(() => {});
      const unsub_token = id("u").slice(2, 26);
      const links = { report: reportLink(env, rec.id, rec.share_key), book: bookLink(env, rec.id, rec.share_key, base.id), unsub: unsubLink(env, unsub_token) };
      const mail = await composeEmail(env, { plan, biz, audit, links });
      const rank = audit.visibility?.queries?.[0] || null;
      const row = { ...base, audit_id: rec.id, email, score: audit.score, grade: audit.grade, rank_label: rank?.label || null, rank_position: rank?.position ?? null, subject: mail.subject, body_text: mail.body, unsub_token };
      if (live) {
        await sendEmail(env, { to: email, subject: mail.subject, text: mail.body, unsub: links.unsub });
        await insertOutreach(env, { ...row, status: "sent", sent_at: now() });
        run.emailed++; budget--;
        log.push({ business: biz.name, email, score: audit.score, rank: rank ? `${rank.position ?? "n/a"} for "${rank.label}"` : null, status: "sent", subject: mail.subject });
      } else {
        await insertOutreach(env, { ...row, status: "queued" });
        budget--;
        log.push({ business: biz.name, email, score: audit.score, rank: rank ? `${rank.position ?? "n/a"} for "${rank.label}"` : null, status: "queued (dry run)", subject: mail.subject, preview: mail.body.slice(0, 400) });
      }
    } catch (e) {
      if (isLimitError(e)) { run.notes = `request limit hit at ${biz.name} — it will be retried on the next tick`; break; } // not recorded, so it's retried
      run.errors.push(`${biz.name}: ${String(e?.message || e).slice(0, 160)}`);
      await insertOutreach(env, { ...base, email, status: "error", last_error: String(e?.message || e).slice(0, 300) }).catch(() => {});
    }
  }
  run.subrequests = fc.n;
  await saveRun(env, run);
  return { plan, run, log, live };
}

// Follow-up: one bump, 4+ days after the first email, to anyone who hasn't booked, replied or unsubscribed.
export async function runFollowups(env, { dryRun, timeBudgetMs } = {}) {
  if (!hasDB(env)) throw new Error("D1 not bound");
  const deadline = Date.now() + Number(timeBudgetMs || 20000);
  const live = env.OUTBOUND_ENABLED === "1" && !dryRun;
  const cutoff = now() - Number(env.OUTBOUND_FOLLOWUP_DAYS || 4) * 86400;
  const { results } = await env.DB.prepare("SELECT o.*, a.share_key FROM outreach o LEFT JOIN audits a ON a.id = o.audit_id WHERE o.status = 'sent' AND o.sent_at <= ?1 ORDER BY o.sent_at ASC LIMIT ?2").bind(cutoff, Number(env.OUTBOUND_DAILY_CAP || 10)).all();
  const run = { id: id("run"), day: planFor(env).day, mode: "followups", found: results?.length || 0, emailed: 0, skipped: 0, followups: 0, errors: [], started_at: now() };
  const log = [];
  for (const o of results || []) {
    if (Date.now() > deadline) { run.notes = "time budget reached — remaining follow-ups go out on the next run"; break; }
    if (await suppressed(env, o.email)) { await setStatus(env, o.id, "unsubscribed"); continue; }
    const links = { report: reportLink(env, o.audit_id, o.share_key), book: bookLink(env, o.audit_id, o.share_key, o.id), unsub: unsubLink(env, o.unsub_token) };
    const first = (o.subject || "").replace(/^re:\s*/i, "");
    const text = `Hi,\n\nFollowing up on the audit I sent for ${o.business} — ${o.rank_position ? `#${o.rank_position}` : "not in the top 20"} for "${o.rank_label}". The 15-minute call is still open, and the full report (normally $99) is free when you book: ${links.book}\n\nIf the timing's wrong, no problem — just reply and tell me when's better.\n\nBobby\n\n—\nBobby Lloyd · Mesa Intelligence LLC · ${env.OUTBOUND_POSTAL_ADDRESS || "Las Cruces, NM"} · (575) 254-1185\nNot interested? ${links.unsub}`;
    try {
      if (live) await sendEmail(env, { to: o.email, subject: `Re: ${first}`, text, unsub: links.unsub });
      await setStatus(env, o.id, live ? "followup_sent" : "sent", { followup_at: live ? now() : null });
      run.followups++; log.push({ business: o.business, email: o.email, status: live ? "followup sent" : "would follow up" });
    } catch (e) { run.errors.push(`${o.business}: ${String(e?.message || e).slice(0, 160)}`); }
  }
  await saveRun(env, run);
  return { run, log, live };
}

async function saveRun(env, run) {
  run.finished_at = now();
  await env.DB.prepare("INSERT OR REPLACE INTO outbound_runs (id, day, mode, category, city, found, emailed, skipped, followups, errors_json, notes, started_at, finished_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)")
    .bind(run.id, run.day, run.mode, run.category || null, run.city || null, run.found, run.emailed, run.skipped, run.followups, JSON.stringify(run.errors || []), run.notes || null, run.started_at, run.finished_at).run();
}

// ---------- call sheet (Bobby dials these himself — never an AI voice) ----------
// Businesses today's run found but couldn't email: no website, or no email on the site. Weakest presence first.
const LINE_LABEL = { mobile: "mobile", landline: "landline", fixedVoip: "VoIP", nonFixedVoip: "VoIP (app)", tollFree: "toll-free", voip: "VoIP" };
async function lineType(env, phone) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || env.CALLSHEET_LOOKUP === "0") return null;
  const d = String(phone || "").replace(/\D/g, ""); const e164 = d.length === 10 ? `+1${d}` : d.length === 11 ? `+${d}` : null;
  if (!e164) return null;
  try {
    const res = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`, { headers: { authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}` } });
    if (!res.ok) return null;
    const j = await res.json(); return j?.line_type_intelligence?.type || null;
  } catch { return null; }
}
// Same findings, phrased for saying out loud to the owner.
function spoken(r) {
  if (!r.website) return "there's no website on your Google listing, so people searching can't check you out before they call";
  if (r.reviews != null && r.reviews < 15) return `you've only got ${r.reviews} Google review${r.reviews === 1 ? "" : "s"}, and the businesses ranking above you usually have a lot more`;
  if (r.rating != null && r.rating > 0 && r.rating < 4.3) return `your Google rating is sitting at ${Number(r.rating).toFixed(1)}, which costs you clicks`;
  return "your website doesn't list an email, so anyone who finds you after hours has nowhere to send a request";
}
function weakSignals(r) {
  const out = [];
  if (!r.website) out.push("no website on their Google listing");
  else if (/no email/.test(r.skip_reason || "")) out.push("website has no email address, so leads have to call or fill a form");
  if (r.reviews != null && r.reviews < 15) out.push(`only ${r.reviews} Google review${r.reviews === 1 ? "" : "s"}`);
  if (r.rating != null && r.rating > 0 && r.rating < 4.3) out.push(`${Number(r.rating).toFixed(1)}★ rating`);
  return out;
}
export async function callSheet(env, day, { max = Number(env.CALLSHEET_MAX || 15) } = {}) {
  if (!hasDB(env)) return [];
  const runs = "SELECT id FROM outbound_runs WHERE day = ?1 AND mode = 'daily'";
  let rows;
  try {
    rows = (await env.DB.prepare(`SELECT id, business, phone, website, city, category, skip_reason, rating, reviews FROM outreach WHERE run_id IN (${runs}) AND status = 'skipped' AND phone IS NOT NULL AND phone != '' AND (skip_reason LIKE 'no website%' OR skip_reason LIKE 'no email%')`).bind(day).all()).results || [];
  } catch {
    rows = ((await env.DB.prepare(`SELECT id, business, phone, website, city, category, skip_reason FROM outreach WHERE run_id IN (${runs}) AND status = 'skipped' AND phone IS NOT NULL AND phone != '' AND (skip_reason LIKE 'no website%' OR skip_reason LIKE 'no email%')`).bind(day).all()).results || []);
  }
  const ranked = rows.map((r) => ({ ...r, signals: weakSignals(r) }))
    .sort((a, b) => (b.website ? 0 : 1) - (a.website ? 0 : 1) || b.signals.length - a.signals.length || (a.reviews ?? 999) - (b.reviews ?? 999))
    .slice(0, max);
  for (const r of ranked) {
    r.line = await lineType(env, r.phone);
    const mk = MARKETS[r.city];
    const cat = CATEGORIES[r.category];
    r.opener = `Hi, is this the owner of ${r.business}? Bobby Lloyd, Mesa Intelligence, ${mk?.local ? mk.local : "out of Las Cruces, New Mexico"}. I was looking at your Google listing and noticed ${spoken(r)}. I work with ${cat?.plural || "local businesses"} on one problem: calls that ring out when you're on a job. I built an AI line that answers, books the job and texts the customer. I'll put it on a test number for ${env.PLAN_TRIAL_DAYS ?? 14} days free so you can hear it. Worth 10 minutes?`;
  }
  return ranked;
}
function callSheetHtml(calls, esc) {
  if (!calls?.length) return "";
  const row = (r) => {
    const mob = r.line === "mobile";
    return `<tr style="vertical-align:top;border-top:1px solid #eee${mob ? ";color:#999" : ""}">
      <td style="padding:6px 10px 6px 0"><b>${esc(r.business)}</b><br><span style="color:#777">${esc(MARKETS[r.city]?.label || r.city)}</span></td>
      <td style="padding:6px 10px 6px 0;white-space:nowrap"><a href="tel:${esc(String(r.phone).replace(/[^\d+]/g, ""))}">${esc(r.phone)}</a><br><span style="color:${mob ? "#B23B1A" : "#777"}">${esc(LINE_LABEL[r.line] || "line type ?")}${mob ? " — skip unless clearly a business line" : ""}</span></td>
      <td style="padding:6px 10px 6px 0">${esc(r.signals.join("; ") || "weak listing")}</td>
    </tr>
    <tr><td colspan="3" style="padding:0 0 8px;color:#444;font-size:12px"><i>"${esc(r.opener)}"</i></td></tr>`;
  };
  return `<h3 style="margin-top:22px">📞 Call sheet (${calls.length}) — businesses we couldn't email</h3>
    <p style="font-size:12px;color:#555;margin:0 0 8px">You dial these yourself (no AI voice or autodialer — FCC treats AI voices as artificial under the TCPA). Call business landlines/VoIP; skip numbers flagged mobile unless they're clearly the business line. If someone asks not to be called again, don't call back. If they say yes, get their email and run their audit in /admin → Audit.</p>
    <table style="border-collapse:collapse;font-size:13px;width:100%">${calls.map(row).join("")}</table>`;
}

// ---------- reporting ----------
// Sends the day's digest once (guarded in rate_limits), so the noon tick can't double-send.
export async function sendDigestOnce(env, date = new Date()) {
  if (!hasDB(env)) return { sent: false, reason: "no db" };
  const plan = planFor(env, date);
  const key = `outbound-digest:${plan.day}`;
  try {
    const r = await env.DB.prepare("SELECT count FROM rate_limits WHERE k = ?").bind(key).first();
    if (r) return { sent: false, reason: "already sent today" };
  } catch {}
  const s = await summary(env, 1);
  if (s) s.calls = await callSheet(env, plan.day).catch((e) => { console.error("callsheet", e?.message || e); return []; });
  const ok = await emailDigest(env, s, plan);
  if (ok) { try { await env.DB.prepare("INSERT INTO rate_limits (k, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(k) DO UPDATE SET count = 1").bind(key, now()).run(); } catch {} }
  return { sent: ok };
}

export async function summary(env, days = 1) {
  if (!hasDB(env)) return null;
  const since = now() - days * 86400;
  const [runs, recent, totals, booked] = await Promise.all([
    env.DB.prepare("SELECT * FROM outbound_runs WHERE started_at >= ?1 ORDER BY started_at DESC").bind(since).all(),
    env.DB.prepare("SELECT id, business, email, category, city, score, grade, rank_label, rank_position, status, skip_reason, subject, sent_at, booked_at, created_at FROM outreach WHERE created_at >= ?1 OR updated_at >= ?1 ORDER BY created_at DESC LIMIT 200").bind(since).all(),
    env.DB.prepare("SELECT status, COUNT(*) AS n FROM outreach GROUP BY status").all(),
    env.DB.prepare("SELECT b.*, o.business AS ob_business FROM sales_bookings b LEFT JOIN outreach o ON o.id = b.outreach_id WHERE b.created_at >= ?1 ORDER BY b.start_at ASC").bind(since).all(),
  ]);
  return { runs: runs.results || [], recent: recent.results || [], totals: Object.fromEntries((totals.results || []).map((r) => [r.status, r.n])), bookings: booked.results || [] };
}

export async function emailDigest(env, s, plan) {
  if (!env.RESEND_API_KEY || !env.LEAD_TO || !s) return false;
  const esc = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const sent = s.recent.filter((r) => ["sent", "followup_sent", "booked"].includes(r.status));
  const skipped = s.recent.filter((r) => r.status === "skipped");
  const rows = sent.map((r) => `<tr><td style="padding:4px 10px 4px 0">${esc(r.business)}${r.city && MARKETS[r.city] ? `<br><span style="color:#777">${esc(MARKETS[r.city].label)}</span>` : ""}</td><td style="padding:4px 10px 4px 0">${esc(r.email)}</td><td style="padding:4px 10px 4px 0">${r.score ?? "—"}</td><td style="padding:4px 10px 4px 0">${r.rank_position ? `#${r.rank_position}` : "n/a"} ${esc(r.rank_label || "")}</td><td>${esc(r.status)}</td></tr>`).join("");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:720px;color:#111">
    <h2 style="margin:0 0 4px">Outbound — ${esc(plan.day)} · ${esc(plan.category?.label || plan.mode)} · ${esc(plan.city.label)}${plan.overflow?.length ? ` (+ ${esc(plan.overflow.map((m) => m.label).join(", "))} if needed)` : ""}</h2>
    <p style="color:#555;margin:0 0 14px">${s.runs.map((r) => `${r.mode}: found ${r.found}, emailed ${r.emailed}, skipped ${r.skipped}, follow-ups ${r.followups}${JSON.parse(r.errors_json || "[]").length ? `, errors ${JSON.parse(r.errors_json).length}` : ""}`).join(" · ") || "no runs"}</p>
    ${s.bookings.length ? `<h3>📅 Booked calls</h3><ul>${s.bookings.map((b) => `<li><b>${esc(b.business || b.ob_business)}</b> — ${esc(b.name)} (${esc(b.email)}${b.phone ? `, ${esc(b.phone)}` : ""}) · ${new Date(b.start_at * 1000).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</li>`).join("")}</ul>` : ""}
    <h3>Emails (${sent.length})</h3>
    ${rows ? `<table style="border-collapse:collapse;font-size:13px"><tr style="color:#777;text-align:left"><th>Business</th><th>Email</th><th>Score</th><th>Rank</th><th>Status</th></tr>${rows}</table>` : "<p>None.</p>"}
    ${skipped.length ? `<h3 style="margin-top:18px">Skipped (${skipped.length})</h3><p style="font-size:13px;color:#555">${skipped.map((r) => `${esc(r.business)} — ${esc(r.skip_reason)}`).join("<br>")}</p>` : ""}
    ${s.runs.some((r) => JSON.parse(r.errors_json || "[]").length) ? `<h3 style="color:#B23B1A">Errors</h3><pre style="font-size:12px;white-space:pre-wrap">${esc(s.runs.flatMap((r) => JSON.parse(r.errors_json || "[]")).join("\n"))}</pre>` : ""}
    ${callSheetHtml(s.calls, esc)}
    ${!env.OUTBOUND_POSTAL_ADDRESS ? `<p style="color:#B23B1A;font-size:12px;margin-top:16px">⚠️ OUTBOUND_POSTAL_ADDRESS isn't set — the footer says only "Las Cruces, NM". CAN-SPAM requires a valid postal address (a PO box or registered mailbox works). Add it in Cloudflare → Settings → Variables.</p>` : ""}
    <p style="color:#777;font-size:12px;margin-top:16px">Totals to date: ${Object.entries(s.totals).map(([k, v]) => `${k} ${v}`).join(" · ")}. Replies land in hello@ — anyone who writes back, mark them in /admin → Outbound.</p>
  </div>`;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", to: [env.LEAD_TO], subject: `Outbound ${plan.day}: ${sent.length} emailed${s.calls?.length ? `, ${s.calls.length} to call` : ""}${s.bookings.length ? `, ${s.bookings.length} booked` : ""} — ${plan.category?.label || plan.mode} · ${plan.city.label}`, html }) });
  return res.ok;
}
