// POST /api/plan/checkout { a (audit_id), k (share_key), interval: "month"|"year", email?, name?, o?, code? } → { url }
import { loadAudit } from "../../_lib/audit.js";
import { createPlanCheckout, planConfigured, planPrice, planAnnual } from "../../_lib/plan.js";
import { hit } from "../../_lib/db.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (!planConfigured(env)) return json({ detail: "The plan isn't open for signup yet — email hello@mesaintelligence.ai." }, 503);
  const b = (await readJSON(request)) || {};
  const lim = await hit(env, `plan-checkout:${clientIp(request)}`, 3600, 10);
  if (!lim.allowed) return json({ detail: "Too many attempts — try again in an hour." }, 429);
  let audit = b.a ? await loadAudit(env, String(b.a)) : null;
  if (audit && audit.share_key !== String(b.k || "")) audit = null;
  const email = String(b.email || "").trim().slice(0, 200);
  if (!audit && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ detail: "Enter your email to start." }, 400);
  try {
    const s = await createPlanCheckout(env, { audit, email, name: b.name, interval: b.interval === "year" ? "year" : "month", outreachId: String(b.o || "").slice(0, 40), code: String(b.code || "").slice(0, 40) });
    return json({ url: s.url, price: planPrice(env), annual: planAnnual(env) });
  } catch (e) { console.error("plan checkout", e?.message || e); return json({ detail: "Couldn't start checkout — email hello@mesaintelligence.ai and we'll set you up by hand." }, 502); }
}
