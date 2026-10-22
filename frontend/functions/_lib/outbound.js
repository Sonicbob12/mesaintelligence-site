// Outbound engine — one category per weekday, one city per week, N cold emails a day.
//
//   Mon HVAC · Tue restaurants · Wed dental · Thu legal · Fri follow-ups + digest only.
//   Odd campaign weeks = Las Cruces, even = El Paso (week 1 starts OUTBOUND_START, default 2026-10-19).
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
export const SCHEDULE = {
  mon: { key: "hvac", label: "HVAC", search: "HVAC contractor", queries: ["HVAC contractor", "air conditioning repair", "heating and cooling service", "refrigerated air installation", "furnace repair"], angle: "missed calls and after-hours dispatch — every call that rings out is a service ticket somebody else gets" },
  tue: { key: "restaurant", label: "Restaurants", search: "restaurant", queries: ["restaurant", "mexican restaurant", "family restaurant", "steakhouse", "cafe", "bar and grill"], angle: "hosting and reservations — people decide where to eat from the listing, the photos and whether they can book in two taps" },
  wed: { key: "dental", label: "Dental", search: "dentist", queries: ["dentist", "dental clinic", "family dentistry", "orthodontist", "pediatric dentist", "cosmetic dentist"], angle: "new-patient intake — the practice that answers first and books online wins the patient" },
  thu: { key: "legal", label: "Legal", search: "law firm", queries: ["law firm", "personal injury lawyer", "family law attorney", "criminal defense attorney", "immigration lawyer", "estate planning attorney"], angle: "client intake — a potential client who can't reach you in the first hour calls the next firm on the list" },
};
export const CITIES = [
  { key: "las-cruces", label: "Las Cruces", query: "Las Cruces, NM", center: { latitude: 32.3199, longitude: -106.7637 },
    nearby: [{ query: "Mesilla, NM", center: { latitude: 32.2701, longitude: -106.8006 } }, { query: "Anthony, NM", center: { latitude: 32.0040, longitude: -106.6056 } }, { query: "Santa Teresa, NM", center: { latitude: 31.8559, longitude: -106.6392 } }, { query: "Sunland Park, NM", center: { latitude: 31.7965, longitude: -106.5799 } }] },
  { key: "el-paso", label: "El Paso", query: "El Paso, TX", center: { latitude: 31.7619, longitude: -106.485 },
    nearby: [{ query: "Horizon City, TX", center: { latitude: 31.6929, longitude: -106.2072 } }, { query: "Socorro, TX", center: { latitude: 31.6546, longitude: -106.3033 } }, { query: "Canutillo, TX", center: { latitude: 31.9118, longitude: -106.5992 } }, { query: "Anthony, TX", center: { latitude: 31.9993, longitude: -106.6050 } }] },
];

export function planFor(env, date = new Date()) {
  const d = localDate(date, TZ);
  const start = env.OUTBOUND_START || "2026-10-19";
  const dayMs = 86400000;
  const weeks = Math.floor((Date.parse(`${d.iso}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / (7 * dayMs));
  const city = CITIES[((weeks % 2) + 2) % 2];
  const cat = SCHEDULE[d.weekday] || null;
  return { day: d.iso, weekday: d.weekday, week: weeks + 1, city, category: cat, mode: cat ? "daily" : d.weekday === "fri" ? "followups" : "off" };
}

// ---------- finding an email on the business website ----------
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BAD_EMAIL = /(example|sentry|wixpress|godaddy|squarespace|wordpress|cloudflare|\.png|\.jpg|\.gif|\.svg|\.webp|noreply|no-reply|donotreply|privacy@|abuse@|legal@|press@|careers@|jobs@|hr@|billing@|accounting@|support@)/i;
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
  const areas = [{ query: plan.city.query, center: plan.city.center, pages: 2 }, ...(plan.city.nearby || []).map((n) => ({ ...n, pages: 1 }))];
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
        yield { id: p.id, name: p.displayName?.text || "", website: p.websiteUri || "", phone: p.nationalPhoneNumber || "", rating: p.rating ?? null, reviews: p.userRatingCount || 0, address: p.formattedAddress || "", query: `${q} in ${area.query}` };
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
    business: biz.name, business_type: plan.category.label, city: plan.city.label,
    overall_score: audit.score, grade: audit.grade,
    rank: rank ? { search: rank.label, position: rank.position, of: rank.results, leader: rank.leader?.name, leader_reviews: rank.leader?.reviewCount } : null,
    reviews: audit.place.reviewCount, rating: audit.place.rating, local_median_reviews: audit.competitors.medianReviews,
    biggest_problems: top.map((i) => `${i.label}: ${i.detail}`),
    has_website: audit.hasWebsite, website_score: audit.websiteScore,
    industry_angle: plan.category.angle,
  };
  const system = [
    "You write short cold emails for Bobby Lloyd, founder of Mesa Intelligence, a Las Cruces NM firm that builds practical AI (missed-call answering, online booking, review requests) for local businesses.",
    "Write to the owner of a local business about a free audit Bobby just ran on their Google listing. Plain text. 70-110 words. No subject line in the body. No bullet points, no markdown, no exclamation marks, no hype words (game-changer, skyrocket, unlock).",
    "Structure: 1) one sentence that states their most striking real number (rank or reviews gap) — specific, not flattering. 2) one sentence on what it costs them, tied to the industry_angle. 3) one sentence: Bobby runs a local company and the full report is normally $99, but it's free if they book a 15-minute call — then the placeholder {BOOK_LINK}. 4) one line sign-off: Bobby. Mention the free summary with the placeholder {REPORT_LINK} once, naturally.",
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
    body = `Hi,\n\nI ran a quick audit on ${biz.name}'s Google listing this morning: ${r}${audit.competitors.medianReviews ? `, with ${audit.place.reviewCount} reviews against a local median of ${audit.competitors.medianReviews}` : ""}. The free summary is here: {REPORT_LINK}\n\nFor a ${plan.category.label.toLowerCase()} business that mostly comes down to ${plan.category.angle.split(" — ")[0]}.\n\nI run Mesa Intelligence here in Las Cruces. The full report is normally $99, but it's free if you book a 15-minute call with me: {BOOK_LINK}\n\nBobby`;
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

// ---------- the daily run ----------
export async function runDaily(env, { date = new Date(), limit, dryRun, timeBudgetMs } = {}) {
  const t0 = Date.now();
  const deadline = t0 + Number(timeBudgetMs || env.OUTBOUND_TIME_BUDGET_MS || 25000);
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
    const base = { id: id("ob"), place_id: biz.id, run_id: run.id, category: plan.category.key, city: plan.city.key, business: biz.name, website: biz.website, phone: biz.phone };
    const skip = async (reason) => { run.skipped++; log.push({ business: biz.name, status: "skipped", reason }); await insertOutreach(env, { ...base, status: "skipped", skip_reason: reason }); };
    if (!biz.website) { await skip("no website on listing"); continue; }
    let email = null;
    try { email = await findEmail(biz.website); } catch {}
    if (!email) { await skip("no email found on website"); continue; }
    if (await suppressed(env, email)) { await skip("suppressed"); continue; }

    try {
      const audit = await runAudit(env, biz.id);
      const data = derived(audit);
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
      run.errors.push(`${biz.name}: ${String(e?.message || e).slice(0, 160)}`);
      await insertOutreach(env, { ...base, email, status: "error", last_error: String(e?.message || e).slice(0, 300) }).catch(() => {});
    }
  }
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
  const rows = sent.map((r) => `<tr><td style="padding:4px 10px 4px 0">${esc(r.business)}</td><td style="padding:4px 10px 4px 0">${esc(r.email)}</td><td style="padding:4px 10px 4px 0">${r.score ?? "—"}</td><td style="padding:4px 10px 4px 0">${r.rank_position ? `#${r.rank_position}` : "n/a"} ${esc(r.rank_label || "")}</td><td>${esc(r.status)}</td></tr>`).join("");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:720px;color:#111">
    <h2 style="margin:0 0 4px">Outbound — ${esc(plan.day)} · ${esc(plan.category?.label || plan.mode)} · ${esc(plan.city.label)} (week ${plan.week})</h2>
    <p style="color:#555;margin:0 0 14px">${s.runs.map((r) => `${r.mode}: found ${r.found}, emailed ${r.emailed}, skipped ${r.skipped}, follow-ups ${r.followups}${JSON.parse(r.errors_json || "[]").length ? `, errors ${JSON.parse(r.errors_json).length}` : ""}`).join(" · ") || "no runs"}</p>
    ${s.bookings.length ? `<h3>📅 Booked calls</h3><ul>${s.bookings.map((b) => `<li><b>${esc(b.business || b.ob_business)}</b> — ${esc(b.name)} (${esc(b.email)}${b.phone ? `, ${esc(b.phone)}` : ""}) · ${new Date(b.start_at * 1000).toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</li>`).join("")}</ul>` : ""}
    <h3>Emails (${sent.length})</h3>
    ${rows ? `<table style="border-collapse:collapse;font-size:13px"><tr style="color:#777;text-align:left"><th>Business</th><th>Email</th><th>Score</th><th>Rank</th><th>Status</th></tr>${rows}</table>` : "<p>None.</p>"}
    ${skipped.length ? `<h3 style="margin-top:18px">Skipped (${skipped.length})</h3><p style="font-size:13px;color:#555">${skipped.map((r) => `${esc(r.business)} — ${esc(r.skip_reason)}`).join("<br>")}</p>` : ""}
    ${s.runs.some((r) => JSON.parse(r.errors_json || "[]").length) ? `<h3 style="color:#B23B1A">Errors</h3><pre style="font-size:12px;white-space:pre-wrap">${esc(s.runs.flatMap((r) => JSON.parse(r.errors_json || "[]")).join("\n"))}</pre>` : ""}
    <p style="color:#777;font-size:12px;margin-top:16px">Totals to date: ${Object.entries(s.totals).map(([k, v]) => `${k} ${v}`).join(" · ")}. Replies land in hello@ — anyone who writes back, mark them in /admin → Outbound.</p>
  </div>`;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", to: [env.LEAD_TO], subject: `Outbound ${plan.day}: ${sent.length} emailed${s.bookings.length ? `, ${s.bookings.length} booked` : ""} — ${plan.category?.label || plan.mode} · ${plan.city.label}`, html }) });
  return res.ok;
}
