// POST /api/audit/checkout { audit_id, email?, name? } → { url } Stripe Checkout for the Pro report ($99).
// Only active when AUDIT_PRO_MODE=paid and Stripe is configured.
import { loadAudit, proMode, proPrice, attachContact } from "../../_lib/audit.js";
import { createProCheckout } from "../../_lib/stripe.js";
import { hit, hasDB } from "../../_lib/db.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (proMode(env) !== "paid") return json({ detail: "Pro reports aren't for sale right now." }, 503);
  const b = await readJSON(request);
  const audit = await loadAudit(env, String(b?.audit_id || ""));
  if (!audit) return json({ detail: "That audit expired — run it again." }, 404);
  if (audit.pro) return json({ detail: "This audit is already unlocked.", already: true }, 409);
  const lim = await hit(env, `audit-checkout:${clientIp(request)}`, 3600, 10);
  if (!lim.allowed) return json({ detail: "Too many attempts — try again in an hour." }, 429);

  const email = String(b?.email || audit.contact_email || "").trim().slice(0, 200);
  const name = String(b?.name || audit.contact_name || "").trim().slice(0, 120);
  if (email && !audit.contact_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) await attachContact(env, audit.id, { name: name || "Customer", email, phone: "", business: audit.business_name || audit.full?.place?.name || "" }, null);

  const base = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const link = `${base}/audit/${audit.id}?k=${audit.share_key}`;
  try {
    const session = await createProCheckout(env, {
      auditId: audit.id, email: email || undefined, businessName: audit.business_name || audit.full?.place?.name || "",
      successUrl: `${link}&paid=1&cs={CHECKOUT_SESSION_ID}`, cancelUrl: `${base}/#audit`,
    });
    if (hasDB(env)) await env.DB.prepare("UPDATE audits SET stripe_session = ?2 WHERE id = ?1").bind(audit.id, session.id).run();
    return json({ url: session.url, price: proPrice(env) });
  } catch (e) {
    console.error("checkout", e?.message || e);
    return json({ detail: "Couldn't start checkout — please try again or email hello@mesaintelligence.ai." }, 502);
  }
}
