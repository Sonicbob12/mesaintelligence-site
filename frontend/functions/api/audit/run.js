// POST /api/audit/run { place_id, query } → the audit (scores, checks, competitors).
// The AI fix-it plan is generated in the background and revealed by /api/audit/report.
import { runAudit, derived, saveAudit, actionPlan, savePlan } from "../../_lib/audit.js";
import { hit } from "../../_lib/db.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.GOOGLE_PLACES_API_KEY) return json({ detail: "The audit tool isn't switched on yet." }, 503);
  const b = await readJSON(request);
  const placeId = String(b?.place_id || "").trim();
  if (!placeId) return json({ detail: "Pick your business from the list." }, 400);
  const ip = clientIp(request);
  const perIp = await hit(env, `audit-run:${ip}`, 86400, Number(env.AUDIT_IP_LIMIT_PER_DAY || 3));
  if (!perIp.allowed) return json({ detail: "You've run 3 audits today — book a call and we'll go deeper together." }, 429);
  const day = await hit(env, "audit-run:daily", 86400, Number(env.AUDIT_DAILY_CAP || 50));
  if (!day.allowed) return json({ detail: "The audit tool is resting for today. Book a call and we'll run it for you." }, 429);

  let audit;
  try { audit = await runAudit(env, placeId); }
  catch (e) {
    console.error("audit run", e?.message || e);
    return json({ detail: e.status === 400 || e.status === 404 ? "We couldn't load that listing." : "The audit failed — please try again in a minute." }, e.status === 400 || e.status === 404 ? 400 : 502);
  }
  const data = derived(audit);
  const rec = await saveAudit(env, { place_id: placeId, query: String(b?.query || "").slice(0, 120), source: "public", score: audit.score, grade: audit.grade, data, ip });
  const job = actionPlan(env, data.facts).then((plan) => savePlan(env, rec.id, plan)).catch((e) => console.error("plan bg", e?.message || e));
  if (typeof waitUntil === "function") waitUntil(job);
  return json({ audit_id: rec.id, ...audit });
}
