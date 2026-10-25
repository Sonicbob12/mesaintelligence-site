// Admin: Local Growth Plan subscribers.  GET → list; POST { id, status } or { id, run_audit: true }
import { listPlans, runMonthlyAudits, portalLink } from "../../_lib/plan.js";
import { hasDB, now } from "../../_lib/db.js";
import { usageFor, runUsageBilling } from "../../_lib/usage.js";
import { runTrialCheckins } from "../../_lib/trial.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  if (request.method === "GET") {
    const plans = [];
    for (const p of await listPlans(env)) plans.push({ ...p, portal: portalLink(env, p.portal_token), usage: await usageFor(env, p).catch(() => null) });
    return json({ plans, configured: Boolean(env.STRIPE_PLAN_PRICE_ID) });
  }
  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
  const b = (await readJSON(request)) || {};
  if (b.run_audits) return json(await runMonthlyAudits(env, { limit: Number(b.limit || 5) }));
  if (b.run_usage) return json(await runUsageBilling(env));
  if (b.run_checkins) return json(await runTrialCheckins(env, { force: true }));
  if (b.id && b.run_audit && hasDB(env)) { await env.DB.prepare("UPDATE plans SET next_audit_at = ?2 WHERE id = ?1").bind(String(b.id), now() - 1).run(); return json(await runMonthlyAudits(env, { limit: 1 })); }
  if (b.id && b.status && hasDB(env)) { await env.DB.prepare("UPDATE plans SET status = ?2, updated_at = ?3 WHERE id = ?1").bind(String(b.id), String(b.status).slice(0, 20), now()).run(); return json({ ok: true }); }
  return json({ detail: "Send run_audits, id+run_audit, or id+status" }, 400);
}
