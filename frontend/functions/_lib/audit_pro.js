// Unlocking the Pro report — shared by the email gate (free mode), the Stripe webhook (paid mode)
// and the admin panel. Runs the extras, rebuilds the plan at Pro depth, stores everything, starts
// PageSpeed in the background, and emails the report.
import { loadAudit, runAudit, runProExtras, derived, cacheable, actionPlan, updateAudit, runPageSpeed, recordHistory } from "./audit.js";
import { emailReport } from "./audit_email.js";

export async function unlockPro(env, auditId, { waitUntil, email = true } = {}) {
  const row = await loadAudit(env, auditId);
  if (!row) throw new Error("audit not found");
  if (row.pro && row.full?.pro) return row; // already done (webhook retries, double clicks)

  // The cached free audit is the base; re-run live if the cache expired. Reviews/location are
  // transient, so a live fetch is needed for themes — cheap (one Place Details call).
  let base;
  try { base = await runAudit(env, row.place_id); } catch (e) { console.error("pro base", e?.message || e); base = row.full; }
  if (!base) throw new Error("could not load the listing");

  const full = await runProExtras(env, base);
  const data = derived(full);
  const plan = await actionPlan(env, data.facts, { pro: true });
  await updateAudit(env, auditId, { full: cacheable(full), data, pro: true, plan });
  await recordHistory(env, { id: auditId, place_id: row.place_id, score: full.score, created_at: Math.floor(Date.now() / 1000), data });

  const bg = [];
  if (full.place.website) bg.push(runPageSpeed(env, auditId, full.website?.url || full.place.website).catch((e) => console.error("psi", e?.message || e)));
  if (email && row.contact_email) {
    bg.push(emailReport(env, { to: row.contact_email, name: row.contact_name, business: row.business_name || full.place.name, data, plan, pro: true, link: reportLink(env, auditId, row.share_key) }).catch((e) => console.error("pro mail", e?.message || e)));
  }
  const all = Promise.all(bg);
  if (typeof waitUntil === "function") waitUntil(all); else await all;
  return { ...row, full: cacheable(full), data, plan, pro: true };
}

export function reportLink(env, auditId, shareKey) {
  const base = (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
  return `${base}/audit/${auditId}?k=${shareKey || ""}`;
}
