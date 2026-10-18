// GET /api/audit/view?id=<audit_id>&k=<share_key> → the stored report for the shareable page.
// The full audit is cached 30 days (Google's limit); after that it's re-fetched live and re-cached.
import { loadAudit, runAudit, cacheable, updateAudit, historyFor, proMode, proPrice } from "../../_lib/audit.js";
import { hit } from "../../_lib/db.js";
import { clientIp, json } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const id = String(u.searchParams.get("id") || "").slice(0, 60);
  const k = String(u.searchParams.get("k") || "").slice(0, 40);
  const row = await loadAudit(env, id);
  if (!row || !row.share_key || row.share_key !== k) return json({ detail: "Report not found." }, 404);

  let full = row.full;
  if (!full) {
    const lim = await hit(env, `audit-view-refresh:${clientIp(request)}`, 3600, 10);
    if (!lim.allowed) return json({ detail: "Please try again in a bit." }, 429);
    try {
      const live = await runAudit(env, row.place_id);
      full = cacheable(live);
      full.pro = row.pro ? { expired: true } : null; // Pro extras need a re-run; keep the stored plan
      await updateAudit(env, id, { full });
    } catch (e) { return json({ detail: "This report has expired and the listing couldn't be reloaded." }, 410); }
  }
  const history = await historyFor(env, row.place_id);
  return json({
    audit_id: row.id, created_at: row.created_at, pro: row.pro, pro_mode: proMode(env), pro_price: proPrice(env),
    business: row.business_name || full.place?.name || "", contact_name: row.contact_name || "",
    full, plan: row.plan, history,
  });
}
