// GET/POST /api/cron/tick?token=<CRON_TOKEN> — hourly housekeeping. Cloudflare Pages has no built-in
// scheduler, so an external cron (cron-job.org, UptimeRobot, GitHub Actions…) pings this once an hour.
// Sends day-before appointment reminders and the owners' daily digests.
import { sendDueReminders, sendDigests } from "../../_lib/workflow.js";
import { listTenants, loadTenant } from "../../_lib/tenants.js";
import { json } from "../../_lib/http.js";
import { runMonthlyAudits } from "../../_lib/plan.js";
import { runUsageBilling } from "../../_lib/usage.js";
import { runTrialCheckins } from "../../_lib/trial.js";
import { retryVoiceProvisioning } from "../../_lib/voice_retry.js";
import { runDaily, planFor, sendDigestOnce } from "../../_lib/outbound.js";
import { localDate } from "../../_lib/time.js";

export async function onRequest({ request, env, waitUntil }) {
  if (!env.CRON_TOKEN) return json({ detail: "CRON_TOKEN not set" }, 503);
  const tok = new URL(request.url).searchParams.get("token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (tok !== env.CRON_TOKEN) return json({ detail: "Unauthorized" }, 401);
  const reminders = await sendDueReminders(env, loadTenant).catch((e) => ({ error: String(e?.message || e) }));
  const digests = await sendDigests(env, await listTenants(env)).catch((e) => ({ error: String(e?.message || e) }));
  const plans = await runMonthlyAudits(env).catch((e) => ({ error: String(e?.message || e) }));
  // Voice minutes: 80%/100% alerts and overage invoice items for plans past their allowance (usage.js).
  const usage = await runUsageBilling(env).catch((e) => ({ error: String(e?.message || e) }));
  // Trial check-ins: day-3 "what it did" and the T-4 "trial ends" email (trial.js), business hours only.
  const checkins = await runTrialCheckins(env).catch((e) => ({ error: String(e?.message || e) }));
  // Voice lines that failed to provision at signup: retry hourly, email the client when the number lands (voice_retry.js).
  const voiceRetry = await retryVoiceProvisioning(env).catch((e) => ({ error: String(e?.message || e) }));
  // Outbound top-up: if the 7:05 run didn't reach the daily cap, keep going on the 8 AM–3 PM ticks (weekday
  // categories only). Runs in the background so cron-job.org's 30 s timeout can't cut it off. This invocation has
  // already spent requests on reminders/digests/audits, so the outbound share gets a smaller request budget.
  let outbound = null;
  const hour = Number(localDate(new Date(), "America/Denver").hh);
  const plan = planFor(env);
  const bg = (p) => (typeof waitUntil === "function" ? (waitUntil(p.catch((e) => console.error("tick bg", e))), "started in background") : p);
  const lastTopUp = Number(env.OUTBOUND_TOPUP_UNTIL || 15);
  if (env.OUTBOUND_ENABLED === "1" && hour >= 8 && hour <= lastTopUp && plan.mode === "daily") {
    outbound = await bg(runDaily(env, { timeBudgetMs: Number(env.OUTBOUND_TICK_BUDGET_MS || 18000), subrequestLimit: Number(env.OUTBOUND_TICK_SUBREQUEST_LIMIT || env.OUTBOUND_SUBREQUEST_LIMIT || 38) })
      .then((r) => ({ emailed: r.run.emailed, skipped: r.run.skipped, found: r.run.found, notes: r.run.notes || null, errors: r.run.errors.length })));
  }
  // Daily outbound digest + call sheet at 4 PM on weekdays, after the top-ups (sent once per day).
  let digest = null;
  const digestHour = Number(env.OUTBOUND_DIGEST_HOUR || lastTopUp + 1);
  if (env.OUTBOUND_ENABLED === "1" && hour >= digestHour && hour <= digestHour + 2 && plan.mode !== "off") digest = await bg(sendDigestOnce(env));
  return json({ ok: true, at: new Date().toISOString(), reminders, digests, plans, usage, checkins, voice_retry: voiceRetry, outbound, digest });
}
