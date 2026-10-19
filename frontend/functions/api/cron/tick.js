// GET/POST /api/cron/tick?token=<CRON_TOKEN> — hourly housekeeping. Cloudflare Pages has no built-in
// scheduler, so an external cron (cron-job.org, UptimeRobot, GitHub Actions…) pings this once an hour.
// Sends day-before appointment reminders and the owners' daily digests.
import { sendDueReminders, sendDigests } from "../../_lib/workflow.js";
import { listTenants, loadTenant } from "../../_lib/tenants.js";
import { json } from "../../_lib/http.js";
import { runMonthlyAudits } from "../../_lib/plan.js";

export async function onRequest({ request, env }) {
  if (!env.CRON_TOKEN) return json({ detail: "CRON_TOKEN not set" }, 503);
  const tok = new URL(request.url).searchParams.get("token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (tok !== env.CRON_TOKEN) return json({ detail: "Unauthorized" }, 401);
  const reminders = await sendDueReminders(env, loadTenant).catch((e) => ({ error: String(e?.message || e) }));
  const digests = await sendDigests(env, await listTenants(env)).catch((e) => ({ error: String(e?.message || e) }));
  const plans = await runMonthlyAudits(env).catch((e) => ({ error: String(e?.message || e) }));
  return json({ ok: true, at: new Date().toISOString(), reminders, digests, plans });
}
