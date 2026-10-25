// Client portal.
//   GET  /api/plan/portal?t=<token>            → plan, tenant (public bits), score history, review requests, widget snippet
//   GET  /api/plan/portal?cs=<checkout session> → { token } once the webhook has provisioned (the success page polls this)
//   POST /api/plan/portal { t, action: "onboard", ...fields }   save setup
//   POST /api/plan/portal { t, action: "review", customer_name, phone?, email? }  send a review request
//   POST /api/plan/portal { t, action: "billing" }  → Stripe customer portal URL
import { planByToken, planBySession, saveOnboarding, sendReviewRequest, reviewRequests, billingPortalUrl, portalLink } from "../../_lib/plan.js";
import { historyFor, loadAudit } from "../../_lib/audit.js";
import { reportLink } from "../../_lib/audit_pro.js";
import { hasDB, hit, safeJSON } from "../../_lib/db.js";
import { usageFor, recentCalls } from "../../_lib/usage.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

async function view(env, plan) {
  const t = hasDB(env) ? await env.DB.prepare("SELECT id, name, vertical, greeting, hours_json, services_json, notify_email, voice_number, retell_agent_id, active FROM tenants WHERE id = ?").bind(plan.tenant_id).first() : null;
  const last = plan.last_audit_id ? await loadAudit(env, plan.last_audit_id) : null;
  const site = (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
  return {
    plan: { id: plan.id, business: plan.business, name: plan.name, email: plan.email, phone: plan.phone, status: plan.status, interval: plan.interval, onboarded: plan.onboarded, settings: plan.settings, next_audit_at: plan.next_audit_at, last_score: plan.last_score, created_at: plan.created_at, place_id: plan.place_id },
    tenant: t ? { id: t.id, name: t.name, vertical: t.vertical, greeting: t.greeting, hours: safeJSON(t.hours_json, {}), services: safeJSON(t.services_json, []), notify_email: t.notify_email, voice_number: t.voice_number, voice: Boolean(t.retell_agent_id), active: t.active !== 0 } : null,
    history: await historyFor(env, plan.place_id),
    last_report: last ? reportLink(env, last.id, last.share_key) : null,
    reviews: await reviewRequests(env, plan.id),
    usage: await usageFor(env, plan).catch(() => null),
    calls: await recentCalls(env, plan).catch(() => []),
    widget: t ? `<script src="${site}/widget.js" data-tenant="${t.id}" defer></script>` : null,
    sms_enabled: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
  };
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const cs = u.searchParams.get("cs");
  if (cs) { const p = await planBySession(env, cs); return json(p ? { token: p.portal_token, link: portalLink(env, p.portal_token) } : { pending: true }); }
  const plan = await planByToken(env, u.searchParams.get("t"));
  if (!plan) return json({ detail: "Not found." }, 404);
  return json(await view(env, plan));
}

export async function onRequestPost({ request, env }) {
  const b = (await readJSON(request)) || {};
  const plan = await planByToken(env, b.t);
  if (!plan) return json({ detail: "Not found." }, 404);
  const lim = await hit(env, `portal:${clientIp(request)}`, 3600, 60);
  if (!lim.allowed) return json({ detail: "Slow down a little." }, 429);
  try {
    if (b.action === "onboard") { await saveOnboarding(env, plan, b); return json(await view(env, await planByToken(env, b.t))); }
    if (b.action === "review") { const r = await sendReviewRequest(env, plan, b); return json({ ok: true, sent: r, reviews: await reviewRequests(env, plan.id) }); }
    if (b.action === "billing") { if (!plan.stripe_customer) return json({ detail: "Billing isn't linked yet — email hello@mesaintelligence.ai." }, 400); return json({ url: await billingPortalUrl(env, plan.stripe_customer, portalLink(env, plan.portal_token)) }); }
    return json({ detail: "Unknown action" }, 400);
  } catch (e) { return json({ detail: String(e?.message || e).slice(0, 200) }, 400); }
}
