// Admin: Outbound.  Authorization: Bearer <ADMIN_TOKEN>.
//   GET  /api/admin/outbound?days=7                 → runs, recent outreach, totals, bookings, today's plan
//   POST /api/admin/outbound { run: "daily"|"followups"|"digest", dry?: true, limit?: N }  → run now
//   POST /api/admin/outbound { id, status }          → mark replied / booked / skipped etc.
//   POST /api/admin/outbound { suppress: "email", reason? }
import { runDaily, runFollowups, summary, emailDigest, planFor, setStatus, suppress } from "../../_lib/outbound.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  const plan = planFor(env);
  if (request.method === "GET") {
    const days = Number(new URL(request.url).searchParams.get("days") || 7);
    return json({ plan, enabled: env.OUTBOUND_ENABLED === "1", cap: Number(env.OUTBOUND_DAILY_CAP || 10), from: env.OUTBOUND_FROM || "Bobby Lloyd <hello@mesaintelligence.ai>", calendar: Boolean(env.SALES_CALENDAR_ID), ...(await summary(env, days)) });
  }
  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
  const b = (await readJSON(request)) || {};
  try {
    if (b.run === "daily") return json(await runDaily(env, { dryRun: Boolean(b.dry), limit: b.limit ? Number(b.limit) : undefined }));
    if (b.run === "followups") return json(await runFollowups(env, { dryRun: Boolean(b.dry) }));
    if (b.run === "digest") { const s = await summary(env, 1); return json({ emailed: await emailDigest(env, s, plan), ...s }); }
    if (b.id && b.status) { await setStatus(env, String(b.id), String(b.status).slice(0, 20)); return json({ ok: true }); }
    if (b.suppress) { await suppress(env, String(b.suppress), String(b.reason || "admin")); return json({ ok: true }); }
    return json({ detail: "Send run, id+status, or suppress" }, 400);
  } catch (e) { return json({ detail: String(e?.message || e).slice(0, 300) }, 500); }
}
