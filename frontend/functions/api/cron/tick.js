// GET/POST /api/cron/tick?token=<CRON_TOKEN> — hourly housekeeping. Cloudflare Pages has no built-in
// scheduler, so an external cron (cron-job.org, UptimeRobot, GitHub Actions…) pings this once an hour.
// Sends day-before appointment reminders and the owners' daily digests.
import { sendDueReminders, sendDigests } from "../../_lib/workflow.js";
import { listTenants, loadTenant } from "../../_lib/tenants.js";
import { json } from "../../_lib/http.js";
import { runMonthlyAudits } from "../../_lib/plan.js";
import { runDaily, planFor } from "../../_lib/outbound.js";
import { localDate } from "../../_lib/time.js";

export async function onRequest({ request, env }) {
  if (!env.CRON_TOKEN) return json({ detail: "CRON_TOKEN not set" }, 503);
  const tok = new URL(request.url).searchParams.get("token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (tok !== env.CRON_TOKEN) return json({ detail: "Unauthorized" }, 401);
  const reminders = await sendDueReminders(env, loadTenant).catch((e) => ({ error: String(e?.message || e) }));
  const digests = await sendDigests(env, await listTenants(env)).catch((e) => ({ error: String(e?.message || e) }));
  const plans = await runMonthlyAudits(env).catch((e) => ({ error: String(e?.message || e) }));
  // Outbound top-up: if the 7:05 run didn't reach the daily cap, keep going on the 8–11 AM ticks (weekday categories only).
  let outbound = null;
  const hour = localDate(new Date(), "America/Denver").hh;
  if (env.OUTBOUND_ENABLED === "1" && hour >= 8 && hour <= 11 && planFor(env).mode === "daily") {
    outbound = await runDaily(env, { timeBudgetMs: Number(env.OUTBOUND_TICK_BUDGET_MS || 20000) })
      .then((r) => ({ emailed: r.run.emailed, skipped: r.run.skipped, found: r.run.found, notes: r.run.notes || null, errors: r.run.errors.length }))
      .catch((e) => ({ error: String(e?.message || e) }));
  }
  return json({ ok: true, at: new Date().toISOString(), reminders, digests, plans, outbound });
}
