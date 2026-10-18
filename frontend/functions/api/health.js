// GET /api/health — which pieces are configured. No secrets are revealed.

import { hasDB } from "../_lib/db.js";
import { json } from "../_lib/http.js";
import { proMode, proPrice } from "../_lib/audit.js";

export async function onRequestGet({ env }) {
  let db = "not bound";
  if (hasDB(env)) {
    try {
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM tenants").first();
      db = `ok (${r?.n ?? 0} tenants)`;
    } catch (e) {
      db = `bound but schema missing: ${String(e?.message || e).slice(0, 80)}`;
    }
  }
  return json({
    ok: true,
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    model: env.ANTHROPIC_MODEL || "default",
    resend: Boolean(env.RESEND_API_KEY),
    lead_to: env.LEAD_TO || null,
    twilio: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
    google: Boolean(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_KEY),
    cron: Boolean(env.CRON_TOKEN),
    retell: Boolean(env.RETELL_API_KEY),
    places: Boolean(env.GOOGLE_PLACES_API_KEY),
    audit_pro_mode: proMode(env),
    audit_pro_price: proPrice(env),
    stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID),
    stripe_webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
    pagespeed_key: Boolean(env.PSI_API_KEY),
    admin: Boolean(env.ADMIN_TOKEN),
    db,
    storage: hasDB(env) ? "d1" : "memory (sessions reset; bind D1 as DB to persist)",
  });
}
