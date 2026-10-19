// GET /api/cron/outbound?token=<CRON_TOKEN>&mode=daily|followups|digest|all[&dry=1][&limit=N]
// Pinged once a day (7 AM Mountain) by the scheduled task. "all" = daily send → follow-ups → digest.
import { runDaily, runFollowups, summary, emailDigest, planFor } from "../../_lib/outbound.js";
import { json } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  if (!env.CRON_TOKEN) return json({ detail: "CRON_TOKEN not set" }, 503);
  const u = new URL(request.url);
  const tok = u.searchParams.get("token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (tok !== env.CRON_TOKEN) return json({ detail: "Unauthorized" }, 401);
  const mode = u.searchParams.get("mode") || "all";
  const dryRun = u.searchParams.get("dry") === "1";
  const limit = u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : undefined;
  const out = { ok: true, at: new Date().toISOString(), plan: planFor(env), enabled: env.OUTBOUND_ENABLED === "1", dryRun };
  try {
    if (mode === "daily" || mode === "all") out.daily = await runDaily(env, { limit, dryRun });
    if (mode === "followups" || mode === "all") out.followups = await runFollowups(env, { dryRun });
    if (mode === "digest" || mode === "all") { const s = await summary(env, 1); out.digest = { emailed: await emailDigest(env, s, out.plan), ...s }; }
  } catch (e) { out.ok = false; out.error = String(e?.message || e); }
  return json(out);
}
