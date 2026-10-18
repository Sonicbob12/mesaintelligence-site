// POST /api/stripe/webhook — Stripe → checkout.session.completed unlocks the Pro report.
// Configure the endpoint in Stripe Dashboard → Developers → Webhooks → https://mesaintelligence.ai/api/stripe/webhook
// with the event "checkout.session.completed"; put its signing secret in STRIPE_WEBHOOK_SECRET.
import { verifyWebhook } from "../../_lib/stripe.js";
import { unlockPro } from "../../_lib/audit_pro.js";
import { loadAudit, auditByStripeSession } from "../../_lib/audit.js";
import { hasDB } from "../../_lib/db.js";
import { json } from "../../_lib/http.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const raw = await request.text();
  let event;
  try { event = await verifyWebhook(env, raw, request.headers.get("stripe-signature")); }
  catch (e) { console.error("stripe webhook", e?.message || e); return json({ detail: "Bad signature" }, 400); }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data?.object || {};
    if (s.payment_status && s.payment_status !== "paid") return json({ received: true, pending: true });
    const auditId = s.metadata?.audit_id || s.client_reference_id;
    let audit = auditId ? await loadAudit(env, auditId) : await auditByStripeSession(env, s.id);
    if (!audit) { console.error("webhook: no audit for session", s.id); return json({ received: true, unmatched: true }); }
    if (hasDB(env)) {
      const email = s.customer_details?.email || s.customer_email || null;
      const name = s.customer_details?.name || null;
      await env.DB.prepare("UPDATE audits SET stripe_session = ?2, stripe_payment = ?3, contact_email = COALESCE(contact_email, ?4), contact_name = COALESCE(contact_name, ?5) WHERE id = ?1")
        .bind(audit.id, s.id, s.payment_intent || null, email, name).run();
    }
    try { await unlockPro(env, audit.id, { waitUntil, email: true }); }
    catch (e) { console.error("webhook unlock", e?.message || e); return json({ detail: "unlock failed" }, 500); } // 500 → Stripe retries
  }
  return json({ received: true });
}
