// GET/POST /api/cron/tick?token=<CRON_TOKEN> — hourly housekeeping. Cloudflare Pages has no built-in
// scheduler, so an external cron (cron-job.org, UptimeRobot, GitHub Actions…) pings this once an hour.
// Sends day-before appointment reminders and the owners' daily digests.
import { sendDueReminders, sendDigests } from "../../_lib/workflow.js";
import { listTenants, loadTenant } from "../../_lib/tenants.js";
import { json } from "../../_lib/http.js";
import { runMonthlyAudits } from "../../_lib/plan.js";
import { runDaily, planFor, sendDigestOnce } from "../../_lib/outbound.js";
import { localDate } from "../../_lib/time.js";

export async function onRequest({ request, env, waitUntil }) {
  if (!env.CRON_TOKEN) return json({ detail: "CRON_TOKEN not set" }, 503);
  const tok = new URL(request.url).searchParams.get("token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (tok !== env.CRON_TOKEN) return json({ detail: "Unauthorized" }, 401);
  const reminders = await sendDueReminders(env, loadTenant).catch((e) => ({ error: String(e?.message || e) }));
  const digests = await sendDigests(env, await listTenants(env)).catch((e) => ({ error: String(e?.message || e) }));
  const plans = await runMonthlyAudits(env).catch((e) => ({ error: String(e?.message || e) }));
  // Outbound top-up: if the 7:05 run didn't reach the daily cap, keep going on the 8–11 AM ticks (weekday categories
  // only). Runs in the background so cron-job.org's 30 s timeout can't cut it off.
  let outbound = null;
  const hour = Number(localDate(new Date(), "America/Denver").hh);
  const plan = planFor(env);
  const bg = (p) => (typeof waitUntil === "function" ? (waitUntil(p.catch((e) => console.error("tick bg", e))), "started in background") : p);
  if (env.OUTBOUND_ENABLED === "1" && hour >= 8 && hour <= 11 && plan.mode === "daily") {
    outbound = await bg(runDaily(env, { timeBudgetMs: Number(env.OUTBOUND_TICK_BUDGET_MS || 18000) })
      .then((r) => ({ emailed: r.run.emailed, skipped: r.run.skipped, found: r.run.found, notes: r.run.notes || null, errors: r.run.errors.length })));
  }
  // Daily outbound digest at noon on weekdays, after the morning top-ups (sent once per day).
  let digest = null;
  if (env.OUTBOUND_ENABLED === "1" && hour === 12 && plan.mode !== "off") digest = await bg(sendDigestOnce(env));
  return json({ ok: true, at: new Date().toISOString(), reminders, digests, plans, outbound, digest });
}
