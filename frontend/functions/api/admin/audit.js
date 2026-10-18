// Admin: Local Discovery.  Authorization: Bearer <ADMIN_TOKEN>.
//   GET  /api/admin/audit                      → recent audits (public + admin) with contact info + history
//   POST /api/admin/audit { query }            → candidate listings
//   POST /api/admin/audit { place_id }         → full PRO audit + plan, no rate limits (saved as source "admin")
//   POST /api/admin/audit { audit_id }         → stored findings + plan for a past audit
//   POST /api/admin/audit { audit_id, unlock } → unlock Pro on a public audit (comp it) and email the report
//   POST /api/admin/audit { place_id, debug }  → which fields Google returned
import { searchCandidates, placeRaw } from "../../_lib/places.js";
import { runAudit, runProExtras, derived, cacheable, saveAudit, actionPlan, loadAudit, recentAudits, runPageSpeed, historyFor } from "../../_lib/audit.js";
import { unlockPro, reportLink } from "../../_lib/audit_pro.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env, waitUntil }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (request.method === "GET") return json({ audits: await recentAudits(env, 100), places: Boolean(env.GOOGLE_PLACES_API_KEY), site: env.SITE_URL || "https://mesaintelligence.ai" });
  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
  const b = (await readJSON(request)) || {};
  try {
    if (b.audit_id && b.unlock) {
      const done = await unlockPro(env, String(b.audit_id), { waitUntil, email: b.email !== false });
      return json({ ok: true, pro: true, link: reportLink(env, done.id, done.share_key), plan: done.plan });
    }
    if (b.audit_id) {
      const a = await loadAudit(env, b.audit_id);
      if (!a) return json({ detail: "Not found" }, 404);
      const { data_json, plan_json, full_json, ip, ...rest } = a;
      return json({ ...rest, link: reportLink(env, a.id, a.share_key), history: await historyFor(env, a.place_id) });
    }
    if (!env.GOOGLE_PLACES_API_KEY) return json({ detail: "GOOGLE_PLACES_API_KEY is not set in Cloudflare Pages secrets" }, 503);
    if (b.query) return json({ candidates: await searchCandidates(env, String(b.query).slice(0, 120)) });
    if (b.place_id && b.debug) {
      const raw = await placeRaw(env, String(b.place_id));
      return json({ keys: Object.keys(raw), photos: Array.isArray(raw.photos) ? raw.photos.length : null, reviews: Array.isArray(raw.reviews) ? raw.reviews.length : null, primaryType: raw.primaryType, types: raw.types, rating: raw.rating, userRatingCount: raw.userRatingCount });
    }
    if (b.place_id) {
      const base = await runAudit(env, String(b.place_id));
      const audit = b.basic ? base : await runProExtras(env, base);
      const data = derived(audit);
      const plan = await actionPlan(env, data.facts, { pro: !b.basic });
      const rec = await saveAudit(env, { place_id: audit.place.id, query: audit.place.name, source: "admin", score: audit.score, grade: audit.grade, data, plan, full: cacheable(audit), pro: !b.basic });
      if (!b.basic && audit.place.website && typeof waitUntil === "function") waitUntil(runPageSpeed(env, rec.id, audit.website?.url || audit.place.website).catch(() => {}));
      const { _reviews, _location, ...pub } = audit;
      return json({ audit_id: rec.id, share_key: rec.share_key, link: reportLink(env, rec.id, rec.share_key), ...pub, plan, history: await historyFor(env, audit.place.id) });
    }
    return json({ detail: "Send query, place_id or audit_id" }, 400);
  } catch (e) {
    console.error("admin audit", e?.message || e);
    return json({ detail: String(e?.message || e).slice(0, 300) }, e.status && e.status < 500 ? e.status : 502);
  }
}
