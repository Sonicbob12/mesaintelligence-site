// Website previews — "I noticed you don't have a website, so I made one for you."
//
// Each weekday morning the cron tick builds up to PREVIEW_DAILY (10) one-page websites for trades businesses the
// outbound engine found with NO website on their Google listing (outreach.skip_reason 'no website on listing').
// Each lives at /p/<slug> (noindex). Bobby texts the owner BY HAND from his own phone — never through the Mesa
// Twilio number (that 10DLC campaign is registered for appointment messages only; cold marketing texts would put
// client lines at risk) and never automated (TCPA). /admin → Website previews and the outbound digest list the
// day's businesses with the first text, a tap-to-text link and the follow-up text that carries the link.
//
// Storage: our own table `previews` (self-applying). Per Google's Places terms we store the place_id plus our own
// generated copy; hours, rating and phone are fetched live from Places when the page renders.
// Signals: first view of a page (bots and link-preview fetchers excluded, ?admin=1 excluded) and a click on
// "Make it mine" email Bobby (LEAD_TO). The claim button goes to /plan tagged utm_source=preview.
//
// Env: PREVIEW_DAILY (10), PREVIEWS_ENABLED ("0" stops the daily build), PREVIEW_SKIP_LANDLINES ("0" keeps them).

import { placeDetails } from "./places.js";
import { runModelCollect } from "./anthropic.js";
import { hasDB, hit, id, now } from "./db.js";
import { localDate, zonedToUtc } from "./time.js";
import { CATEGORIES, MARKETS, lineType } from "./outbound.js";

const TZ = "America/Denver";
const site = (env) => (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
export const BOBBY_PHONE = "(575) 254-1185";
const TRADE_KEYS = ["hvac", "plumbing", "electrical", "roofing", "landscaping", "contractor"];

// ---------- schema ----------
let ready = false;
export async function ensurePreviewSchema(env) {
  if (ready || !hasDB(env)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS previews (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, place_id TEXT NOT NULL UNIQUE, outreach_id TEXT,
    business TEXT NOT NULL, category TEXT NOT NULL, city TEXT NOT NULL, phone TEXT, line_type TEXT,
    status TEXT NOT NULL DEFAULT 'ready', -- ready | texted | replied | link_sent | claimed | declined | optout | skipped
    skip_reason TEXT, copy_json TEXT, views INTEGER NOT NULL DEFAULT 0, last_view_at INTEGER, claim_clicks INTEGER NOT NULL DEFAULT 0,
    texted_at INTEGER, replied_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS previews_status ON previews (status, created_at)").run();
  ready = true;
}

// ---------- trade defaults (also the fallback when the model is unavailable) ----------
export const TRADES = {
  hvac: { name: "Heating & Air", accent: "#1C6DB5", icon: "hvac", services: [
    ["AC Repair", "Fast diagnosis and repair when your air conditioner quits on a hot day."],
    ["AC & Refrigerated Air Installation", "New systems sized for your home, installed clean and tested before we leave."],
    ["Heating & Furnace Repair", "Furnaces and heat pumps back up and running when the nights get cold."],
    ["Seasonal Tune-Ups", "Spring and fall maintenance that keeps your system efficient and catches problems early."],
    ["Evaporative Coolers", "Swamp cooler repair, pads, pumps and seasonal start-ups and shut-downs."],
    ["Thermostats & Air Quality", "Thermostat upgrades, filters and airflow fixes for a more comfortable home."]] },
  plumbing: { name: "Plumbing", accent: "#0E7C86", icon: "plumbing", services: [
    ["Leak Repair", "Dripping faucets, burst pipes and hidden leaks found and fixed."],
    ["Drain Cleaning", "Slow and clogged drains cleared in kitchens, bathrooms and main lines."],
    ["Water Heaters", "Tank and tankless water heater repair and replacement."],
    ["Fixtures & Installs", "Toilets, sinks, faucets, disposals and showers installed right."],
    ["Sewer & Water Lines", "Repairs and replacements for the lines that run to your home."],
    ["Emergency Plumbing", "When water is where it shouldn't be, call and we'll get you sorted."]] },
  electrical: { name: "Electrical", accent: "#B7791F", icon: "electrical", services: [
    ["Panel Upgrades", "Panel replacements and upgrades for more capacity and safer service."],
    ["Wiring & Rewiring", "New circuits, remodel wiring and updates for older homes."],
    ["Lighting", "Indoor, outdoor, recessed and security lighting installed and repaired."],
    ["Outlets & Switches", "New outlets, GFCI protection, dimmers and switch repairs."],
    ["Troubleshooting", "Breakers that trip, lights that flicker and outlets that quit, tracked down and fixed."],
    ["EV Chargers & Appliances", "Dedicated circuits for EV chargers, ranges, dryers and shop equipment."]] },
  roofing: { name: "Roofing", accent: "#A3412A", icon: "roofing", services: [
    ["Roof Repair", "Leaks, missing shingles, cracked tile and flashing repaired."],
    ["Roof Replacement", "Complete tear-offs and new roofs built for the desert sun."],
    ["Flat & Foam Roofs", "Coatings, foam and flat-roof repair for homes and commercial buildings."],
    ["Storm & Hail Damage", "Inspections after wind and hail, with photos you can use for your claim."],
    ["Roof Inspections", "A clear look at your roof's condition before you buy, sell or repair."],
    ["Gutters & Stucco", "Gutters, downspouts and stucco work that keeps water off your walls."]] },
  landscaping: { name: "Landscaping", accent: "#3E7D3A", icon: "landscaping", services: [
    ["Lawn Care", "Mowing, edging and regular maintenance that keeps your yard sharp."],
    ["Landscape Design & Installs", "New beds, rock, pavers and plantings that fit your space."],
    ["Irrigation & Sprinklers", "Drip and sprinkler installs, repairs and timer setup."],
    ["Xeriscaping", "Low-water desert landscaping that looks good year round."],
    ["Tree & Shrub Trimming", "Pruning and trimming for healthier trees and a cleaner look."],
    ["Cleanups", "Seasonal cleanups, weed control and hauling."]] },
  contractor: { name: "Construction & Remodeling", accent: "#4B5563", icon: "contractor", services: [
    ["Remodeling", "Kitchens, bathrooms and whole-room remodels done start to finish."],
    ["Additions", "More space for your family, built to match your home."],
    ["Concrete & Flatwork", "Driveways, patios, sidewalks and slabs."],
    ["Repairs", "Drywall, framing, doors, windows and the punch list you keep putting off."],
    ["Painting", "Interior and exterior painting with clean lines and good prep."],
    ["Fencing & Outdoor", "Fences, block walls, gates and outdoor living spaces."]] },
};

const ICONS = {
  hvac: '<path d="M32 6v52M9.5 19l45 26M9.5 45l45-26" /><path d="M25 9l7 6 7-6M25 55l7-6 7 6M7 27l9-2-2-9M57 37l-9 2 2 9M7 37l9 2-2 9M57 27l-9-2 2-9" />',
  plumbing: '<path d="M32 6C32 6 14 28 14 40a18 18 0 0 0 36 0C50 28 32 6 32 6z" /><path d="M24 42a8 8 0 0 0 8 8" />',
  electrical: '<path d="M36 4L12 36h18l-4 24 26-34H34l2-22z" />',
  roofing: '<path d="M4 32L32 8l28 24" /><path d="M12 26v30h40V26" /><path d="M26 56V40h12v16" />',
  landscaping: '<path d="M32 58V30" /><path d="M32 30C32 16 44 8 56 8c0 14-10 22-24 22z" /><path d="M32 38C32 26 22 20 10 20c0 12 8 18 22 18z" />',
  contractor: '<path d="M10 54l26-26" /><path d="M30 14l20 20 6-6-20-20c-6-2-12 0-14 2l8 4z" />',
};
const icon = (k, size = 64, stroke = "currentColor") => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.contractor}</svg>`;

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function slugify(name, city) {
  const base = `${name} ${city || ""}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/\b(llc|inc|co|corp|ltd)\b\.?/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
  const tail = crypto.randomUUID().replace(/-/g, "").slice(0, 4);
  return `${base || "business"}-${tail}`;
}
export function e164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === "1" ? `+${d}` : null;
}
export const previewUrl = (env, slug) => `${site(env)}/p/${slug}`;
function marketLabel(key) { return MARKETS[key]?.label || String(key || "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim();

// The two texts Bobby sends by hand. First one asks; the link goes out only after they answer.
export function textMessages(env, row) {
  const mk = MARKETS[row.city];
  const who = mk?.local ? `Bobby Lloyd with Mesa Intelligence, ${mk.local}` : "Bobby Lloyd with Mesa Intelligence in Las Cruces, NM";
  const biz = cleanName(row.business);
  const first = `Hi, is this the owner of ${biz}? This is ${who}. I noticed ${biz} doesn't have a website on its Google listing, so I made one for you. Want me to send you the link? (If you're not interested, reply STOP and I won't text again.)`;
  const trial = env.PLAN_TRIAL_DAYS ?? 14, price = env.PLAN_PRICE_USD || 249;
  const followup = `Here it is: ${previewUrl(env, row.slug)}\n\nI built it from your Google listing, so it has your number, hours and services. Tell me anything you want changed and I'll update it. If you want it live on your own domain, it comes with our Local Growth Plan (the website plus an AI line that answers your calls when you can't). It's free for ${trial} days, then $${price}/mo. Happy to walk you through it.`;
  const to = e164(row.phone);
  return { first, followup, sms_first: to ? `sms:${to}?&body=${encodeURIComponent(first)}` : null, sms_followup: to ? `sms:${to}?&body=${encodeURIComponent(followup)}` : null };
}

// ---------- copy ----------
function fallbackCopy(cat, business, city) {
  const t = TRADES[cat] || TRADES.contractor;
  return {
    headline: `${t.name} in ${city}`,
    sub: `${cleanName(business)} handles ${t.name.toLowerCase()} work for homes and businesses in ${city} and nearby. Call for service or a quote.`,
    about: `${cleanName(business)} is a local ${CATEGORIES[cat]?.noun || "contractor"} serving ${city} and the surrounding area. Call to talk through the job, get a quote, or get on the schedule.`,
    services: t.services.map(([name, desc]) => ({ name, desc })),
  };
}
export async function writeCopy(env, { category, business, city, typeLabel }) {
  const base = fallbackCopy(category, business, city);
  if (!env.ANTHROPIC_API_KEY) return base;
  const system = [
    "You write website copy for a small local trades business. The site is a preview built from its Google listing.",
    "Plain, confident, local. No hype words (premier, top-notch, best in town, unparalleled, game-changer). No exclamation marks.",
    "NEVER invent facts: no years in business, licenses, insurance, certifications, awards, warranties, guarantees, prices, response times, 'family-owned', '24/7', team size or brand names. Only say what is true of any business of this trade in this city.",
    "Use the business name and the Google category to tailor services (e.g. a 'refrigeration' company leans commercial refrigeration; a 'stucco' contractor leans stucco).",
    'Respond with JSON only: {"headline":"max 8 words, names the trade and the city","sub":"one sentence, max 24 words","about":"2-3 sentences, max 60 words, third person using the business name","services":[{"name":"max 4 words","desc":"one sentence, max 16 words"}] (exactly 6)}',
  ].join("\n");
  try {
    const { text } = await runModelCollect({ env, system, messages: [{ role: "user", content: JSON.stringify({ business: cleanName(business), trade: CATEGORIES[category]?.noun || category, google_category: typeLabel || null, city }) }], maxTokens: 900 });
    const m = /\{[\s\S]*\}/.exec(text);
    const j = m ? JSON.parse(m[0]) : null;
    const services = Array.isArray(j?.services) ? j.services.filter((s) => s?.name && s?.desc).slice(0, 6).map((s) => ({ name: String(s.name).slice(0, 40), desc: String(s.desc).slice(0, 160) })) : [];
    if (!j?.headline || !j?.about || services.length < 4) return base;
    const banned = /\b(\d+\+?\s*years|licensed|insured|bonded|certified|award|guarantee|warrant|family[-\s]owned|24\/7|since \d{4})\b/i;
    const pick = (v, fb) => (v && !banned.test(v) ? String(v) : fb);
    return {
      headline: pick(j.headline, base.headline).slice(0, 80),
      sub: pick(j.sub, base.sub).slice(0, 220),
      about: pick(j.about, base.about).slice(0, 500),
      services: services.map((s, i) => (banned.test(s.name + " " + s.desc) ? base.services[i] || base.services[0] : s)),
    };
  } catch (e) { console.error("preview copy", e?.message || e); return base; }
}

// ---------- the daily build ----------
function dayStart(date = new Date()) {
  const d = localDate(date, TZ);
  return Math.floor(zonedToUtc(d.y, d.m, d.d, 0, 0, TZ) / 1000);
}
export async function builtToday(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM previews WHERE created_at >= ?1 AND status != 'skipped'").bind(dayStart()).first();
  return Number(r?.n || 0);
}

// Builds up to `max` new previews (default: what's left of PREVIEW_DAILY today). Safe to call repeatedly.
export async function buildPreviews(env, { max, timeBudgetMs = 20000, force = false } = {}) {
  if (!hasDB(env)) throw new Error("D1 not bound");
  await ensurePreviewSchema(env);
  const deadline = Date.now() + timeBudgetMs;
  const daily = Number(env.PREVIEW_DAILY || 10);
  const want = max != null ? Number(max) : Math.max(0, daily - (await builtToday(env)));
  const out = { built: [], skipped: [], pool: 0, want };
  if (want <= 0 && !force) return out;
  const trades = TRADE_KEYS.map((k) => `'${k}'`).join(",");
  const { results } = await env.DB.prepare(`SELECT o.id, o.place_id, o.business, o.category, o.city, o.phone, o.reviews, o.rating FROM outreach o
    WHERE o.status = 'skipped' AND o.skip_reason LIKE 'no website%' AND o.phone IS NOT NULL AND o.phone != ''
      AND o.category IN (${trades}) AND o.place_id NOT IN (SELECT place_id FROM previews)
    ORDER BY CASE WHEN o.city IN ('las-cruces','el-paso') THEN 0 ELSE 1 END, o.created_at DESC LIMIT ?1`).bind(Math.max(want * 3, 10)).all();
  const pool = results || [];
  out.pool = pool.length;
  const seenPhones = new Set();
  for (const o of pool) {
    if (out.built.length >= want || Date.now() > deadline) break;
    const t = now();
    const base = { id: id("pv"), place_id: o.place_id, outreach_id: o.id, business: cleanName(o.business), category: o.category, city: o.city, phone: o.phone };
    const skip = async (reason, extra = {}) => {
      out.skipped.push({ business: base.business, reason });
      await env.DB.prepare("INSERT OR IGNORE INTO previews (id, slug, place_id, outreach_id, business, category, city, phone, line_type, status, skip_reason, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'skipped',?10,?11,?11)")
        .bind(base.id, `x-${base.id}`, base.place_id, base.outreach_id, base.business, base.category, base.city, base.phone, extra.line || null, reason, t).run();
    };
    const digits = String(o.phone).replace(/\D/g, "");
    if (seenPhones.has(digits)) { await skip("duplicate phone"); continue; }
    seenPhones.add(digits);
    let d;
    try { d = await placeDetails(env, o.place_id); }
    catch (e) { out.skipped.push({ business: base.business, reason: `places: ${String(e?.message || e).slice(0, 80)}` }); continue; } // not recorded → retried tomorrow
    if (d.status && d.status !== "OPERATIONAL") { await skip("not operational"); continue; }
    if (d.website) { await skip("has a website now"); continue; }
    const line = await lineType(env, d.phone || o.phone);
    if (line === "landline" && env.PREVIEW_SKIP_LANDLINES !== "0") { await skip("landline — can't text", { line }); continue; }
    const city = d.city || marketLabel(o.city);
    const copy = await writeCopy(env, { category: o.category, business: d.name || base.business, city, typeLabel: d.typeLabel });
    const slug = slugify(d.name || base.business, city);
    await env.DB.prepare("INSERT INTO previews (id, slug, place_id, outreach_id, business, category, city, phone, line_type, status, copy_json, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'ready',?10,?11,?11)")
      .bind(base.id, slug, base.place_id, base.outreach_id, cleanName(d.name || base.business), base.category, base.city, d.phone || base.phone, line, JSON.stringify({ ...copy, city_label: city }), t).run();
    out.built.push({ business: d.name || base.business, slug, url: previewUrl(env, slug), line });
  }
  return out;
}

// ---------- listing for admin + digest ----------
export async function listPreviews(env, { days = 14, status } = {}) {
  if (!hasDB(env)) return [];
  await ensurePreviewSchema(env);
  const since = now() - days * 86400;
  const q = status
    ? env.DB.prepare("SELECT * FROM previews WHERE status = ?1 AND created_at >= ?2 ORDER BY created_at DESC LIMIT 200").bind(status, since)
    : env.DB.prepare("SELECT * FROM previews WHERE status != 'skipped' AND (created_at >= ?1 OR updated_at >= ?1) ORDER BY created_at DESC LIMIT 200").bind(since);
  const rows = (await q.all()).results || [];
  return rows.map((r) => ({ ...r, copy_json: undefined, url: previewUrl(env, r.slug), market: marketLabel(r.city), trade: CATEGORIES[r.category]?.label || r.category, texts: textMessages(env, r) }));
}
export async function previewTotals(env) {
  if (!hasDB(env)) return {};
  await ensurePreviewSchema(env);
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n, SUM(views) AS v, SUM(claim_clicks) AS c FROM previews GROUP BY status").all();
  return Object.fromEntries((results || []).map((r) => [r.status, { n: r.n, views: r.v || 0, claims: r.c || 0 }]));
}
const STAMP = { texted: "texted_at", replied: "replied_at" };
export async function setPreviewStatus(env, idv, status) {
  await ensurePreviewSchema(env);
  const ok = ["ready", "texted", "replied", "link_sent", "claimed", "declined", "optout"];
  if (!ok.includes(status)) throw new Error("bad status");
  const col = STAMP[status];
  await env.DB.prepare(`UPDATE previews SET status = ?2, updated_at = ?3${col ? `, ${col} = COALESCE(${col}, ?3)` : ""} WHERE id = ?1`).bind(idv, status, now()).run();
}

// ---------- signals ----------
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebot|twitterbot|whatsapp|telegram|discord|slack|preview|embedly|google-pagerenderer|headless|curl|wget|python|axios|node-fetch|go-http|okhttp|linkpreview|skype|vkshare|pinterest/i;
export function isHuman(request) {
  const ua = request.headers.get("user-agent") || "";
  return ua.length > 20 && !BOT.test(ua) && request.headers.get("purpose") !== "prefetch" && request.headers.get("sec-purpose") == null;
}
async function alert(env, subject, rows) {
  if (!env.RESEND_API_KEY || !env.LEAD_TO) return;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#111"><h3 style="margin:0 0 8px">${esc(subject)}</h3><table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#666">${esc(k)}</td><td>${v}</td></tr>`).join("")}</table></div>`;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", to: [env.LEAD_TO], subject, html }) }).catch(() => {});
}
export async function recordView(env, row) {
  const t = now();
  const fresh = !row.last_view_at || row.last_view_at < t - 6 * 3600;
  await env.DB.prepare("UPDATE previews SET views = views + 1, last_view_at = ?2, updated_at = ?2 WHERE id = ?1").bind(row.id, t).run();
  if (!fresh) return;
  const tx = textMessages(env, row);
  await alert(env, `👀 ${row.business} opened the website you made them`, [
    ["Business", esc(row.business)], ["Where", esc(marketLabel(row.city))], ["Phone", `<a href="tel:${esc(e164(row.phone) || row.phone)}">${esc(row.phone)}</a>`],
    ["Views", String((row.views || 0) + 1)], ["Status", esc(row.status)], ["Site", `<a href="${esc(previewUrl(env, row.slug))}?admin=1">${esc(previewUrl(env, row.slug))}</a>`],
    ["Next", tx.sms_followup ? `They're looking right now. Good moment to call, or <a href="sms:${esc(e164(row.phone))}">text them</a>.` : "Good moment to call."],
  ]);
}
export async function recordClaim(env, row) {
  const t = now();
  await env.DB.prepare("UPDATE previews SET claim_clicks = claim_clicks + 1, updated_at = ?2 WHERE id = ?1").bind(row.id, t).run();
  await alert(env, `🔥 ${row.business} clicked "Make it mine" on their website`, [
    ["Business", esc(row.business)], ["Phone", `<a href="tel:${esc(e164(row.phone) || row.phone)}">${esc(row.phone)}</a>`], ["Where", esc(marketLabel(row.city))],
    ["Site", `<a href="${esc(previewUrl(env, row.slug))}?admin=1">${esc(previewUrl(env, row.slug))}</a>`], ["Next", "They went to the plan page. If no NEW PLAN alert follows in an hour, call them."],
  ]);
}
export async function loadPreview(env, slug) {
  if (!hasDB(env) || !/^[a-z0-9-]{3,70}$/.test(slug || "")) return null;
  await ensurePreviewSchema(env);
  return env.DB.prepare("SELECT * FROM previews WHERE slug = ?1 AND status != 'skipped'").bind(slug).first();
}
export async function rateOk(env, ip) {
  const r = await hit(env, `preview:ip:${ip}`, 3600, Number(env.PREVIEW_IP_PER_HOUR || 40));
  return r.allowed;
}

// ---------- the page ----------
export function renderPreview(env, row, live) {
  const copy = (() => { try { return JSON.parse(row.copy_json || "{}"); } catch { return {}; } })();
  const fb = fallbackCopy(row.category, row.business, copy.city_label || marketLabel(row.city));
  const c = { ...fb, ...copy, services: copy.services?.length ? copy.services : fb.services };
  const t = TRADES[row.category] || TRADES.contractor;
  const A = t.accent;
  const name = cleanName(live?.name || row.business);
  const phone = live?.phone || row.phone || "";
  const tel = e164(phone) || phone.replace(/[^\d+]/g, "");
  const city = copy.city_label || live?.city || marketLabel(row.city);
  const hours = live?.hours?.length ? live.hours : [];
  const rating = live?.rating && live?.reviewCount ? `<a class="rating" href="${esc(live.mapsUri || "#")}" target="_blank" rel="noopener"><span class="stars">★</span> ${Number(live.rating).toFixed(1)} on Google · ${live.reviewCount} review${live.reviewCount === 1 ? "" : "s"}</a>` : "";
  const claimHref = `/p/${esc(row.slug)}/go`;
  const year = new Date().getFullYear();
  const trial = env.PLAN_TRIAL_DAYS ?? 14, price = env.PLAN_PRICE_USD || 249;
  const faq = [
    [`What areas do you serve?`, `${name} works in ${city} and the surrounding area. Call and we'll let you know if we can get to you.`],
    [`How do I get a quote?`, `Call ${phone ? `<a href="tel:${esc(tel)}">${esc(phone)}</a>` : "us"} and tell us about the job. We'll ask a few questions and get you a quote or a time to come take a look.`],
    ...(hours.length ? [[`When are you open?`, esc(hours.map((h) => h.replace(/ | /g, " ")).join(" · "))]] : []),
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} | ${esc(t.name)} in ${esc(city)}</title>
<meta name="robots" content="noindex,nofollow"><meta name="description" content="${esc(c.sub)}">
<meta property="og:title" content="${esc(name)} — ${esc(t.name)} in ${esc(city)}"><meta property="og:description" content="A website preview made for ${esc(name)}.">
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1d21;background:#fff;line-height:1.55}
a{color:${A}}.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.pbar{background:#0B0C0E;color:#e9e6e1;font-size:13px;padding:9px 0;position:sticky;top:0;z-index:20}.pbar .wrap{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.pbar b{color:#E5A93C}.pbar a{background:#D96B43;color:#0B0C0E;text-decoration:none;font-weight:700;padding:6px 12px;border-radius:4px;white-space:nowrap}
header{border-bottom:1px solid #eceef1}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px;padding-bottom:14px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;color:#111;text-decoration:none}.brand .ic{color:${A};display:flex}
.btn{display:inline-flex;align-items:center;gap:8px;background:${A};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px}
.btn.ghost{background:transparent;color:${A};border:2px solid ${A}}
.hero{background:linear-gradient(135deg,${A}14,${A}05 60%,#fff);padding:64px 0 56px;overflow:hidden;position:relative}
.hero .ic{position:absolute;right:-20px;top:20px;color:${A};opacity:.12}
.hero h1{font-size:clamp(32px,5vw,52px);line-height:1.08;margin:0 0 16px;max-width:720px;letter-spacing:-.02em}
.hero p{font-size:19px;color:#444;max-width:620px;margin:0 0 26px}.cta{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.rating{display:inline-block;margin-top:22px;color:#333;text-decoration:none;font-size:15px}.stars{color:#E5A93C}
section{padding:56px 0}h2{font-size:30px;margin:0 0 8px;letter-spacing:-.01em}.lead{color:#555;margin:0 0 28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{border:1px solid #e6e8eb;border-radius:10px;padding:20px;background:#fff}.card h3{margin:0 0 6px;font-size:18px}.card p{margin:0;color:#555;font-size:15px}
.card .dot{width:34px;height:34px;border-radius:8px;background:${A}18;color:${A};display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.alt{background:#f6f7f8}.two{display:grid;grid-template-columns:1.3fr 1fr;gap:32px}@media(max-width:760px){.two{grid-template-columns:1fr}}
.hours{list-style:none;padding:0;margin:0;font-size:15px}.hours li{padding:6px 0;border-bottom:1px solid #e6e8eb}
details{border-bottom:1px solid #e6e8eb;padding:14px 0}summary{font-weight:700;cursor:pointer}details p{color:#555;margin:8px 0 0}
.band{background:${A};color:#fff;text-align:center;padding:48px 0}.band h2{color:#fff}.band .btn{background:#fff;color:${A}}
.hcall{display:none}@media(max-width:560px){.hnum{display:none}.hcall{display:inline}.brand{font-size:17px}}
footer{padding:28px 0;color:#777;font-size:13px;text-align:center}
.claim{background:#0B0C0E;color:#e9e6e1;padding:56px 0}.claim h2{color:#F5F3EF}.claim .grid .card{background:#14161A;border-color:#2a2d33}.claim .card h3{color:#F5F3EF}.claim .card p{color:#9E9AA3}
.claim .btn{background:#D96B43;color:#0B0C0E}.claim .btn.ghost{background:transparent;color:#E5A93C;border-color:#E5A93C}.claim small{color:#9E9AA3}
</style></head><body>
<div class="pbar"><div class="wrap"><span><b>Preview</b> made for ${esc(name)} by Mesa Intelligence. It isn't live yet.</span><a href="#claim">Make it mine</a></div></div>
<header><div class="wrap"><a class="brand" href="#top"><span class="ic">${icon(t.icon, 30)}</span>${esc(name)}</a>${phone ? `<a class="btn" href="tel:${esc(tel)}">📞 <span class="hnum">${esc(phone)}</span><span class="hcall">Call</span></a>` : ""}</div></header>
<main id="top">
<div class="hero"><span class="ic">${icon(t.icon, 320)}</span><div class="wrap">
<h1>${esc(c.headline)}</h1><p>${esc(c.sub)}</p>
<div class="cta">${phone ? `<a class="btn" href="tel:${esc(tel)}">Call ${esc(phone)}</a><a class="btn ghost" href="sms:${esc(tel)}">Text us</a>` : ""}</div>
${rating}
</div></div>
<section><div class="wrap"><h2>Services</h2><p class="lead">${esc(t.name)} for homes and businesses in ${esc(city)}.</p>
<div class="grid">${c.services.map((s) => `<div class="card"><div class="dot">${icon(t.icon, 20)}</div><h3>${esc(s.name)}</h3><p>${esc(s.desc)}</p></div>`).join("")}</div></div></section>
<section class="alt"><div class="wrap two"><div><h2>About ${esc(name)}</h2><p>${esc(c.about)}</p>
<p>Serving <b>${esc(city)}</b> and the surrounding area.</p>${phone ? `<p><a class="btn" href="tel:${esc(tel)}">Call ${esc(phone)}</a></p>` : ""}</div>
<div>${hours.length ? `<h2 style="font-size:22px">Hours</h2><ul class="hours">${hours.map((h) => `<li>${esc(h.replace(/ | /g, " "))}</li>`).join("")}</ul>` : ""}</div></div></section>
<section><div class="wrap" style="max-width:760px"><h2>Questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join("")}</div></section>
<div class="band"><div class="wrap"><h2>Need ${esc(t.name.toLowerCase())} help in ${esc(city)}?</h2><p style="margin:0 0 20px;opacity:.9">Call and tell us what's going on.</p>${phone ? `<a class="btn" href="tel:${esc(tel)}">Call ${esc(phone)}</a>` : ""}</div></div>
</main>
<footer>© ${year} ${esc(name)} · ${esc(city)}${live?.mapsUri ? ` · <a href="${esc(live.mapsUri)}" target="_blank" rel="noopener">Find us on Google</a>` : ""} · Ratings and hours from Google</footer>
<div class="claim" id="claim"><div class="wrap">
<p style="font-family:monospace;letter-spacing:.2em;text-transform:uppercase;font-size:11px;color:#E5A93C;margin:0 0 10px">From Bobby at Mesa Intelligence</p>
<h2>Want this website live?</h2>
<p style="color:#9E9AA3;max-width:640px">I built this preview from your Google listing. I can change anything on it: your services, photos, colors, wording. Then I'll put it live on your own web address. It comes with the Local Growth Plan:</p>
<div class="grid" style="margin:22px 0 26px">
<div class="card"><h3>Your website</h3><p>This site on your own domain, hosted and kept up to date. Ask for changes any time.</p></div>
<div class="card"><h3>AI phone line</h3><p>Answers the calls you can't get to, books the job and texts you a summary of every call.</p></div>
<div class="card"><h3>Google listing help</h3><p>Review requests and a monthly check of how you show up in local search.</p></div>
</div>
<div class="cta"><a class="btn" href="${claimHref}">Start my ${trial}-day free trial</a><a class="btn ghost" href="sms:+15752541185">Text Bobby ${BOBBY_PHONE}</a></div>
<p><small>Free for ${trial} days, then $${price}/month. Cancel any time. Not interested? No problem. This preview will be taken down.</small></p>
</div></div>
</body></html>`;
}
