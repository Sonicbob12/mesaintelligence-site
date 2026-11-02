// Trial attribution: which link (a YouTube video, a post, an email) sent each signup.
//
//   Any page visit with utm_* params → _middleware.js sets the first-party cookie `mesa_attr` (30 days, HttpOnly,
//   last tagged visit wins) → /api/plan/checkout reads it into the Stripe Checkout metadata → the webhook's
//   provisionPlan() copies it onto the plans row → /admin → Plans shows the source.
//
//   Video links: /plan?utm_source=youtube&utm_medium=video&utm_content=<video-slug>   (e.g. v01-hvac-after-5)
//   Channel About link: /plan?utm_source=youtube&utm_medium=channel&utm_content=about
//
// "How did you hear about us?" (the /plan form and the report-page offer) rides the same path as `heard_about`,
// a backstop for people who come back later by typing the address.

import { hasDB } from "./db.js";

export const ATTR_COOKIE = "mesa_attr";
export const ATTR_DAYS = 30;
const FIELDS = [["utm_source", "s"], ["utm_medium", "m"], ["utm_campaign", "c"], ["utm_content", "n"], ["utm_term", "t"]];
export const HEARD_OPTIONS = ["YouTube", "Google search", "Facebook or Instagram", "A friend or another business", "Email or call from Bobby", "Other"];

const nowSec = () => Math.floor(Date.now() / 1000);
const clean = (v, max = 100) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "").trim().slice(0, max);

// Request URL → { utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing, at } or null.
export function attributionFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const out = {};
  for (const [k] of FIELDS) { const v = clean(u.searchParams.get(k)); if (v) out[k] = v; }
  if (!out.utm_source && !out.utm_campaign && !out.utm_content) return null;
  out.landing = clean(u.pathname, 120) || "/";
  out.at = nowSec();
  return out;
}

export function attributionCookie(attr) {
  const compact = { l: attr.landing || "/", a: attr.at || nowSec() };
  for (const [k, short] of FIELDS) if (attr[k]) compact[short] = attr[k];
  return `${ATTR_COOKIE}=${encodeURIComponent(JSON.stringify(compact))}; Max-Age=${ATTR_DAYS * 86400}; Path=/; SameSite=Lax; Secure; HttpOnly`;
}

// The cookie back out of a request → the same shape as attributionFromUrl, or null.
export function readAttribution(request) {
  const header = request.headers.get("cookie") || "";
  const raw = header.split(/;\s*/).find((c) => c.startsWith(`${ATTR_COOKIE}=`));
  if (!raw) return null;
  let o;
  try { o = JSON.parse(decodeURIComponent(raw.slice(ATTR_COOKIE.length + 1))); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  const at = Number(o.a) || null;
  if (at && nowSec() - at > ATTR_DAYS * 86400) return null;
  const out = {};
  for (const [k, short] of FIELDS) { const v = clean(o[short]); if (v) out[k] = v; }
  if (!Object.keys(out).length) return null;
  out.landing = clean(o.l, 120) || "";
  out.at = at;
  return out;
}

export function cleanHeard(v) {
  const s = clean(v, 60);
  if (!s) return "";
  return HEARD_OPTIONS.find((o) => o.toLowerCase() === s.toLowerCase()) || `Other: ${s}`.slice(0, 60);
}

// Flat Stripe metadata (only what's set): utm_* + landing + attr_date + heard_about.
export function attributionMetadata(attr, heard) {
  const md = {};
  if (attr) {
    for (const [k] of FIELDS) if (attr[k]) md[k] = attr[k];
    if (attr.landing) md.landing = attr.landing;
    if (attr.at) md.attr_date = new Date(attr.at * 1000).toISOString().slice(0, 10);
  }
  if (heard) md.heard_about = heard;
  return md;
}

// Columns on `plans`; self-applying like ensureUsageSchema, so there is no migration to run by hand.
let schemaReady = false;
export async function ensureAttributionSchema(env) {
  if (schemaReady || !hasDB(env)) return;
  for (const col of ["utm_source TEXT", "utm_medium TEXT", "utm_campaign TEXT", "utm_content TEXT", "utm_term TEXT", "landing_path TEXT", "heard_about TEXT"]) {
    try { await env.DB.prepare(`ALTER TABLE plans ADD COLUMN ${col}`).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e?.message || e))) throw e; }
  }
  schemaReady = true;
}

// Checkout-session metadata → the plan row (called from provisionPlan).
export async function savePlanAttribution(env, planId, md = {}) {
  if (!hasDB(env) || !planId) return;
  await ensureAttributionSchema(env);
  const v = (k, max = 100) => clean(md[k], max) || null;
  await env.DB.prepare("UPDATE plans SET utm_source = ?2, utm_medium = ?3, utm_campaign = ?4, utm_content = ?5, utm_term = ?6, landing_path = ?7, heard_about = ?8 WHERE id = ?1")
    .bind(planId, v("utm_source"), v("utm_medium"), v("utm_campaign"), v("utm_content"), v("utm_term"), v("landing", 120), v("heard_about", 60)).run();
}

// One line for the new-plan alert: "youtube · video · v01-hvac-after-5 — heard about us: YouTube"
export function sourceLine(md = {}) {
  const tag = [md.utm_source, md.utm_medium, md.utm_content || md.utm_campaign].filter(Boolean).join(" · ");
  const heard = md.heard_about ? `heard about us: ${md.heard_about}` : "";
  return [tag, heard].filter(Boolean).join(" — ") || "no tagged link, no answer to \"how did you hear\"";
}
