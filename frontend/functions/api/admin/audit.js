// Admin: Local Discovery.  Authorization: Bearer <ADMIN_TOKEN>.
//   GET  /api/admin/audit                 → recent audits (public + admin) with contact info
//   POST /api/admin/audit { query }       → candidate listings
//   POST /api/admin/audit { place_id }    → full audit + AI plan, no rate limits (saved as source "admin")
//   POST /api/admin/audit { audit_id }    → stored findings + plan for a past audit
import { searchCandidates } from "../../_lib/places.js";
import { runAudit, derived, saveAudit, actionPlan, loadAudit, recentAudits } from "../../_lib/audit.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (request.method === "GET") return json({ audits: await recentAudits(env, 100), places: Boolean(env.GOOGLE_PLACES_API_KEY) });
  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
  const b = (await readJSON(request)) || {};
  try {
    if (b.audit_id) {
      const a = await loadAudit(env, b.audit_id);
      if (!a) return json({ detail: "Not found" }, 404);
      const { data_json, plan_json, ip, ...rest } = a;
      return json(rest);
    }
    if (!env.GOOGLE_PLACES_API_KEY) return json({ detail: "GOOGLE_PLACES_API_KEY is not set in Cloudflare Pages secrets" }, 503);
    if (b.query) return json({ candidates: await searchCandidates(env, String(b.query).slice(0, 120)) });
    if (b.place_id) {
      const audit = await runAudit(env, String(b.place_id));
      const data = derived(audit);
      const plan = await actionPlan(env, data.facts);
      const rec = await saveAudit(env, { place_id: audit.place.id, query: audit.place.name, source: "admin", score: audit.score, grade: audit.grade, data, plan });
      return json({ audit_id: rec.id, ...audit, plan });
    }
    return json({ detail: "Send query, place_id or audit_id" }, 400);
  } catch (e) {
    console.error("admin audit", e?.message || e);
    return json({ detail: String(e?.message || e).slice(0, 300) }, e.status && e.status < 500 ? e.status : 502);
  }
}
