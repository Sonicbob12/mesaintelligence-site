// GET /api/cron/outbound?token=<CRON_TOKEN>&mode=daily|followups|digest|all[&dry=1][&limit=N][&sync=1]
// Pinged at 7:05 AM Mountain, Mon–Fri, by cron-job.org ("Mesa outbound daily", mode=all).
// cron-job.org hangs up after 30 s and Cloudflare cancels the request when it does, so by default the work runs in
// the background (waitUntil) and this returns 202 at once. "all" = daily send → follow-ups. The digest email goes
// out from the noon hourly tick (after the 8–11 AM top-ups) — use mode=digest to send it by hand. sync=1 waits and
// returns the full result (manual testing only).
import { runDaily, runFollowups, summary, emailDigest, planFor } from "../../_lib/outbound.js";
import { json } from "../../_lib/http.js";

export async function onRequest({ request, env, waitUntil }) {
  if (!env.CRON_TOKEN) return json({ detail: "CRON_TOKEN not set" }, 503);
  const u = new URL(request.url);
  const tok = u.searchParams.get("token") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (tok !== env.CRON_TOKEN) return json({ detail: "Unauthorized" }, 401);
  const mode = u.searchParams.get("mode") || "all";
  const dryRun = u.searchParams.get("dry") === "1";
  const sync = u.searchParams.get("sync") === "1" || typeof waitUntil !== "function";
  const limit = u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : undefined;
  const out = { ok: true, at: new Date().toISOString(), plan: planFor(env), enabled: env.OUTBOUND_ENABLED === "1", dryRun, mode };

  const work = async () => {
    try {
      // Background budget is ~30 s after the response; keep the send loop well inside it.
      if (mode === "daily" || mode === "all") out.daily = await runDaily(env, { limit, dryRun, timeBudgetMs: Number(env.OUTBOUND_TIME_BUDGET_MS || 18000) });
      if (mode === "followups" || mode === "all") out.followups = await runFollowups(env, { dryRun, timeBudgetMs: 8000 });
      if (mode === "digest") { const s = await summary(env, 1); out.digest = { emailed: await emailDigest(env, s, out.plan), ...s }; }
    } catch (e) { out.ok = false; out.error = String(e?.message || e); console.error("cron/outbound", out.error); }
    return out;
  };

  if (sync) return json(await work());
  waitUntil(work());
  return json({ ...out, accepted: true, note: "running in the background; results land in /admin → Outbound and the noon digest" }, 202);
}
