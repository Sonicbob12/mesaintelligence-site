// Admin: Website previews.  Authorization: Bearer <ADMIN_TOKEN>.
//   GET  /api/admin/previews?days=14     → previews (with both texts + tap-to-text links), totals, today's count
//   POST /api/admin/previews { build: N } → build N now (default: what's left of today's PREVIEW_DAILY)
//   POST /api/admin/previews { id, status } → ready | texted | replied | link_sent | claimed | declined | optout
import { buildPreviews, listPreviews, previewTotals, setPreviewStatus, builtToday, ensurePreviewSchema } from "../../_lib/preview.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env); if (denied) return denied;
  try {
    await ensurePreviewSchema(env);
    if (request.method === "GET") {
      const days = Number(new URL(request.url).searchParams.get("days") || 14);
      return json({ daily: Number(env.PREVIEW_DAILY || 10), enabled: env.PREVIEWS_ENABLED !== "0", today: await builtToday(env), totals: await previewTotals(env), previews: await listPreviews(env, { days }) });
    }
    if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
    const b = (await readJSON(request)) || {};
    if (b.build != null) return json(await buildPreviews(env, { max: b.build === true ? undefined : Math.min(20, Number(b.build) || 1), timeBudgetMs: 25000, force: true }));
    if (b.id && b.status) { await setPreviewStatus(env, String(b.id), String(b.status)); return json({ ok: true }); }
    return json({ detail: "Send build or id+status" }, 400);
  } catch (e) { return json({ detail: String(e?.message || e).slice(0, 300) }, 500); }
}
