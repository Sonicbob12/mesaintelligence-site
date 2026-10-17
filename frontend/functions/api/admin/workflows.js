// Admin: workflows.  Authorization: Bearer <ADMIN_TOKEN>.
//   GET  /api/admin/workflows?tenant=<id>      → recent runs (all tenants if omitted) + integration status
//   POST /api/admin/workflows { tenant, test: true, phone?, email? }
//        → fires a real test chain for that business (a fake "booking" 2 days out) so you can see every step
//   PUT  /api/admin/workflows { tenant, workflows: { sms, calendar_id, sheet_id, sheet_tab, reminders, digest_hour } }
//        → saves the per-business settings
import { recentRuns, runWorkflow, workflowSettings } from "../../_lib/workflow.js";
import { twilioConfigured } from "../../_lib/twilio.js";
import { googleConfigured } from "../../_lib/google.js";
import { loadTenant } from "../../_lib/tenants.js";
import { hasDB, now } from "../../_lib/db.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const url = new URL(request.url);

  if (request.method === "GET") {
    const tenantId = url.searchParams.get("tenant") || null;
    const tenant = tenantId ? await loadTenant(env, tenantId) : null;
    return json({
      runs: await recentRuns(env, tenantId, Number(url.searchParams.get("limit") || 40)),
      integrations: { twilio: twilioConfigured(env), google: googleConfigured(env), email: Boolean(env.RESEND_API_KEY), cron: Boolean(env.CRON_TOKEN), service_account: env.GOOGLE_SA_EMAIL || null },
      settings: tenant ? workflowSettings(env, tenant) : null,
    });
  }

  const b = (await readJSON(request)) || {};
  const tenant = await loadTenant(env, b.tenant);
  if (!tenant) return json({ detail: "Unknown tenant" }, 400);

  if (request.method === "PUT") {
    if (!hasDB(env)) return json({ detail: "D1 not bound" }, 503);
    const w = b.workflows || {};
    const clean = {
      sms: w.sms !== false, reminders: w.reminders !== false,
      calendar_id: String(w.calendar_id || "").trim() || undefined, sheet_id: String(w.sheet_id || "").trim() || undefined,
      sheet_tab: String(w.sheet_tab || "").trim() || undefined, digest_hour: Number.isFinite(Number(w.digest_hour)) ? Number(w.digest_hour) : undefined,
    };
    await env.DB.prepare("UPDATE tenants SET workflows_json = ?2 WHERE id = ?1").bind(tenant.id, JSON.stringify(clean)).run();
    return json({ ok: true, settings: workflowSettings(env, { ...tenant, workflows: clean }) });
  }

  if (request.method === "POST" && b.test) {
    const start = Math.ceil((now() + 2 * 86400) / 1800) * 1800; // two days out, on the half hour
    const rec = { id: `bk_test${Date.now().toString(36)}`, tenant_id: tenant.id, customer_name: b.name || "Test Customer", phone: b.phone || null, email: b.email || null, service: tenant.services?.[0]?.name || "Test appointment", start_at: start, end_at: start + 3600, notes: "Test run from the admin console", status: "confirmed" };
    const run = await runWorkflow(env, tenant, `admin-test-${Date.now()}`, { kind: "booking", rec });
    return json({ ok: true, run });
  }
  return json({ detail: "Method not allowed" }, 405);
}
