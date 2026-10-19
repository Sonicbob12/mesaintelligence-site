// Local Growth Plan — the subscription. Stripe Billing bills it; this module provisions it.
//
//   Report page → /api/plan/checkout → Stripe Checkout (mode=subscription; $99 Pro credit coupon if they paid)
//   → webhook checkout.session.completed (mode=subscription) → provisionPlan(): tenant row + knowledge from the
//   audit + plan row + portal token → welcome email with /portal?t=… → owner finishes onboarding there.
//
// What the plan delivers in software (all already built, now wired per tenant):
//   • monthly Pro re-audit + "what changed" email (runMonthlyAudits, from the hourly cron tick)
//   • review requests after each job (portal → SMS via Twilio or email via Resend, with their Google review link)
//   • 24/7 web chat agent for their site (widget.js + tenant), bookings/leads emailed to them (workflow engine)
//   • voice line / missed-call text-back: set up by Bobby (Retell + number) — flagged in the portal as "being set up"
//
// Env: STRIPE_PLAN_PRICE_ID (monthly), STRIPE_PLAN_ANNUAL_PRICE_ID (optional), STRIPE_PRO_CREDIT_COUPON (optional,
// a $99-off-once coupon id), PLAN_PRICE_USD (249), PLAN_ANNUAL_USD (2388).

import { stripe } from "./stripe.js";
import { loadAudit, runAudit, runProExtras, derived, cacheable, saveAudit, actionPlan, historyFor } from "./audit.js";
import { reportLink } from "./audit_pro.js";
import { tenantToRow } from "./tenants.js";
import { sendSms, twilioConfigured, toE164 } from "./twilio.js";
import { hasDB, id, now, safeJSON } from "./db.js";

export const planConfigured = (env) => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PLAN_PRICE_ID);
export const planPrice = (env) => Number(env.PLAN_PRICE_USD || 249);
export const planAnnual = (env) => Number(env.PLAN_ANNUAL_USD || 2388);
const site = (env) => (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
export const portalLink = (env, token) => `${site(env)}/portal?t=${token}`;

const VERTICALS = [
  [/hvac|heating|cooling|air\s*cond|refrigerat|furnace/i, "hvac"], [/restaurant|cafe|grill|bistro|taqueria|pizza|bar\b|kitchen|diner|bakery/i, "restaurant"],
  [/dent|orthodont|smile/i, "dental"], [/law|legal|attorney|abogad/i, "legal"], [/plumb|rooter|drain/i, "plumbing"], [/roof/i, "roofing"],
  [/electric/i, "electrical"], [/landscap|lawn|tree/i, "landscaping"], [/auto|tire|mechanic|collision|body shop/i, "auto"], [/spa|salon|barber|nail|lash/i, "beauty"],
];
export function guessVertical(name, typeLabel) {
  const s = `${typeLabel || ""} ${name || ""}`;
  for (const [re, v] of VERTICALS) if (re.test(s)) return v;
  return "local";
}
const slug = (s) => String(s || "biz").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// ---------- checkout ----------
export async function createPlanCheckout(env, { audit, email, name, interval = "month", outreachId }) {
  const price = interval === "year" && env.STRIPE_PLAN_ANNUAL_PRICE_ID ? env.STRIPE_PLAN_ANNUAL_PRICE_ID : env.STRIPE_PLAN_PRICE_ID;
  const business = audit?.business_name || audit?.full?.place?.name || "";
  const paidPro = Boolean(audit?.stripe_payment);
  const body = {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: `${site(env)}/portal?cs={CHECKOUT_SESSION_ID}&welcome=1`,
    cancel_url: audit ? `${reportLink(env, audit.id, audit.share_key)}` : `${site(env)}/#audit`,
    customer_email: email || audit?.contact_email || undefined,
    client_reference_id: audit?.id || undefined,
    metadata: { kind: "plan", audit_id: audit?.id || "", place_id: audit?.place_id || "", business: business.slice(0, 200), outreach_id: outreachId || "", name: String(name || audit?.contact_name || "").slice(0, 120) },
    subscription_data: { metadata: { kind: "plan", audit_id: audit?.id || "", business: business.slice(0, 200) } },
    allow_promotion_codes: true,
    automatic_tax: env.STRIPE_AUTOMATIC_TAX === "1" ? { enabled: true } : undefined,
  };
  if (paidPro && env.STRIPE_PRO_CREDIT_COUPON) { body.discounts = [{ coupon: env.STRIPE_PRO_CREDIT_COUPON }]; delete body.allow_promotion_codes; }
  return stripe(env, "POST", "/checkout/sessions", body, `plan-${audit?.id || email}-${Date.now()}`);
}

export async function billingPortalUrl(env, customerId, returnUrl) {
  const s = await stripe(env, "POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return s.url;
}

// ---------- provisioning (from the webhook) ----------
export async function provisionPlan(env, session, { waitUntil } = {}) {
  if (!hasDB(env)) throw new Error("D1 not bound");
  const existing = await env.DB.prepare("SELECT * FROM plans WHERE stripe_session = ? OR (stripe_subscription = ? AND stripe_subscription IS NOT NULL)").bind(session.id, session.subscription || null).first();
  if (existing) return rowToPlan(existing); // idempotent

  const m = session.metadata || {};
  const auditId = m.audit_id || session.client_reference_id || null;
  const audit = auditId ? await loadAudit(env, auditId) : null;
  const place = audit?.full?.place || {};
  const business = (m.business || audit?.business_name || place.name || session.customer_details?.name || "New client").slice(0, 160);
  const email = session.customer_details?.email || session.customer_email || audit?.contact_email || "";
  const name = m.name || session.customer_details?.name || audit?.contact_name || "";
  const phone = session.customer_details?.phone || audit?.contact_phone || place.phone || "";
  const vertical = guessVertical(business, place.category || place.typeLabel);
  const tenantId = `${slug(business)}-${id("").slice(0, 4)}`;

  // 1) tenant — the chat agent + workflows for this business
  const tenant = {
    id: tenantId, name: business, vertical, timezone: "America/Denver",
    greeting: `Thanks for reaching out to ${business} — how can I help you today?`,
    presets: presetsFor(vertical),
    persona: personaFor(business, vertical, place),
    hours: defaultHours(place.hours), slot_minutes: 60, services: [],
    escalation: "Escalate to a human for emergencies, complaints, pricing disputes, or anything you are not sure about. Never invent prices or policies.",
    notify_email: email || null, sms_number: null, demo: false, active: true, workflows: { sms: true, reminders: true, digest_hour: 18 },
  };
  await env.DB.prepare(`INSERT INTO tenants (id, name, vertical, timezone, greeting, presets_json, persona, hours_json, slot_minutes, services_json, escalation, notify_email, sms_number, demo, active, voice_number, transfer_number, voice_id, workflows_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`).bind(...tenantToRow(tenant)).run();
  await addKnowledge(env, tenantId, `About ${business}`, knowledgeFor(business, place)).catch(() => {});

  // 2) the plan row
  const plan = {
    id: id("pl"), tenant_id: tenantId, audit_id: auditId, place_id: audit?.place_id || m.place_id || null, business, name, email, phone, website: place.website || null,
    stripe_customer: session.customer || null, stripe_subscription: session.subscription || null, stripe_session: session.id,
    price_id: null, interval: null, status: "active", portal_token: id("pt").slice(3, 27), onboarded: 0,
    settings: { review_link: audit?.place_id ? `https://search.google.com/local/writereview?placeid=${audit.place_id}` : "", review_message: "", phone_forward: phone },
    next_audit_at: now() + 30 * 86400, last_audit_id: auditId, last_score: audit?.score ?? null,
  };
  await env.DB.prepare(`INSERT INTO plans (id, tenant_id, audit_id, place_id, business, name, email, phone, website, stripe_customer, stripe_subscription, stripe_session, price_id, interval, status, portal_token, onboarded, settings_json, next_audit_at, last_audit_id, last_score, created_at, updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?22)`)
    .bind(plan.id, plan.tenant_id, plan.audit_id, plan.place_id, plan.business, plan.name, plan.email, plan.phone || null, plan.website, plan.stripe_customer, plan.stripe_subscription, plan.stripe_session, null, null, plan.status, plan.portal_token, 0, JSON.stringify(plan.settings), plan.next_audit_at, plan.last_audit_id, plan.last_score, now()).run();
  if (m.outreach_id) await env.DB.prepare("UPDATE outreach SET status = 'client', updated_at = ?2 WHERE id = ?1").bind(m.outreach_id, now()).run().catch(() => {});

  // 3) emails
  const link = portalLink(env, plan.portal_token);
  const mails = Promise.all([
    sendMail(env, { to: [email], reply_to: env.LEAD_TO, subject: `Welcome to the Local Growth Plan — ${business}`,
      text: `Hi ${name.split(" ")[0] || "there"},\n\nYou're in. Your plan dashboard is here (bookmark it, it's your private link):\n${link}\n\nTake 5 minutes there to finish setup: confirm your hours and services, paste your Google review link, and grab the one-line chat widget for your website.\n\nWhat's running from today:\n• Monthly re-audit of your Google listing, website and search rank, with a "what changed" email\n• One-tap review requests to customers after each job\n• A 24/7 chat agent for your website that books and captures leads, sent straight to ${email}\n• Voice line / missed-call text-back: I'll set this up with you in the next 2 business days\n\nReply to this email any time — it comes straight to me.\n\nBobby Lloyd\nMesa Intelligence · Las Cruces, NM · (575) 254-1185` }),
    env.LEAD_TO ? sendMail(env, { to: [env.LEAD_TO], reply_to: email || undefined, subject: `💵 NEW PLAN: ${business} — ${name} <${email}>`,
      text: `${business}\n${name} <${email}>${phone ? ` · ${phone}` : ""}\nTenant: ${tenantId}\nPortal: ${link}\nStripe customer: ${session.customer || "—"} · subscription: ${session.subscription || "—"}\nAudit: ${auditId ? reportLink(env, auditId, audit?.share_key) : "—"}\n\nTO DO (you): set up the voice line / missed-call text-back for this tenant in /admin → Voice; confirm services in /admin → Tenants.` }) : Promise.resolve(),
  ]).catch((e) => console.error("plan mails", e?.message || e));
  if (typeof waitUntil === "function") waitUntil(mails); else await mails;
  return plan;
}

export async function updatePlanFromSubscription(env, sub) {
  if (!hasDB(env) || !sub?.id) return;
  const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status === "past_due" || sub.status === "unpaid" ? "past_due" : sub.status === "canceled" || sub.status === "incomplete_expired" ? "canceled" : sub.status;
  const price = sub.items?.data?.[0]?.price;
  await env.DB.prepare("UPDATE plans SET status = ?2, price_id = COALESCE(?3, price_id), interval = COALESCE(?4, interval), stripe_customer = COALESCE(stripe_customer, ?5), updated_at = ?6 WHERE stripe_subscription = ?1")
    .bind(sub.id, status, price?.id || null, price?.recurring?.interval || null, sub.customer || null, now()).run();
  if (status === "canceled") {
    const p = await env.DB.prepare("SELECT tenant_id FROM plans WHERE stripe_subscription = ?").bind(sub.id).first();
    if (p?.tenant_id) await env.DB.prepare("UPDATE tenants SET active = 0 WHERE id = ?").bind(p.tenant_id).run();
  } else if (status === "active") {
    const p = await env.DB.prepare("SELECT tenant_id FROM plans WHERE stripe_subscription = ?").bind(sub.id).first();
    if (p?.tenant_id) await env.DB.prepare("UPDATE tenants SET active = 1 WHERE id = ?").bind(p.tenant_id).run();
  }
}

// ---------- portal ----------
export function rowToPlan(r) { return { ...r, settings: safeJSON(r.settings_json, {}), onboarded: Boolean(r.onboarded) }; }
export async function planByToken(env, token) {
  if (!hasDB(env) || !token) return null;
  const r = await env.DB.prepare("SELECT * FROM plans WHERE portal_token = ?").bind(String(token).slice(0, 40)).first();
  return r ? rowToPlan(r) : null;
}
export async function planBySession(env, sessionId) {
  if (!hasDB(env) || !sessionId) return null;
  const r = await env.DB.prepare("SELECT * FROM plans WHERE stripe_session = ?").bind(String(sessionId).slice(0, 80)).first();
  return r ? rowToPlan(r) : null;
}
export async function listPlans(env) {
  if (!hasDB(env)) return [];
  const { results } = await env.DB.prepare("SELECT * FROM plans ORDER BY created_at DESC LIMIT 200").all();
  return (results || []).map(rowToPlan);
}

export async function saveOnboarding(env, plan, b) {
  const settings = { ...plan.settings };
  if (b.review_link != null) settings.review_link = String(b.review_link).trim().slice(0, 400);
  if (b.review_message != null) settings.review_message = String(b.review_message).trim().slice(0, 300);
  if (b.phone_forward != null) settings.phone_forward = String(b.phone_forward).trim().slice(0, 40);
  if (b.website != null) settings.website = String(b.website).trim().slice(0, 200);
  // Tenant edits: hours, services, greeting, notify email
  const t = await env.DB.prepare("SELECT * FROM tenants WHERE id = ?").bind(plan.tenant_id).first();
  if (t) {
    const hours = b.hours && typeof b.hours === "object" ? sanitizeHours(b.hours) : safeJSON(t.hours_json, {});
    const services = Array.isArray(b.services) ? b.services.slice(0, 20).map((s) => ({ name: String(s.name || "").slice(0, 80), minutes: Number(s.minutes) || 60, price: Number(s.price) || 0 })).filter((s) => s.name) : safeJSON(t.services_json, []);
    const notify = b.notify_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.notify_email) ? String(b.notify_email).slice(0, 200) : t.notify_email;
    const greeting = b.greeting != null ? String(b.greeting).slice(0, 200) : t.greeting;
    await env.DB.prepare("UPDATE tenants SET hours_json = ?2, services_json = ?3, notify_email = ?4, greeting = ?5 WHERE id = ?1").bind(plan.tenant_id, JSON.stringify(hours), JSON.stringify(services), notify, greeting).run();
    if (b.about) await addKnowledge(env, plan.tenant_id, "What the owner told us", String(b.about).slice(0, 2000)).catch(() => {});
  }
  await env.DB.prepare("UPDATE plans SET settings_json = ?2, onboarded = 1, phone = COALESCE(?3, phone), updated_at = ?4 WHERE id = ?1").bind(plan.id, JSON.stringify(settings), settings.phone_forward || null, now()).run();
  return { ...plan, settings, onboarded: true };
}

// Review request: SMS when Twilio is configured and a mobile was given, else email.
export async function sendReviewRequest(env, plan, { customer_name, phone, email }) {
  const link = plan.settings?.review_link || (plan.place_id ? `https://search.google.com/local/writereview?placeid=${plan.place_id}` : "");
  if (!link) throw new Error("Add your Google review link in Settings first.");
  const first = String(customer_name || "").trim().split(" ")[0];
  const msg = (plan.settings?.review_message || `Hi{NAME}, thanks for choosing ${plan.business}! If we did a good job, a quick Google review helps us more than you'd think: {LINK}`).replace("{NAME}", first ? ` ${first}` : "").replace("{LINK}", link);
  const rec = { id: id("rr"), plan_id: plan.id, tenant_id: plan.tenant_id, customer_name: String(customer_name || "").slice(0, 80), to_phone: null, to_email: null, channel: null, status: "sent", error: null };
  try {
    if (phone && twilioConfigured(env) && toE164(phone)) { await sendSms(env, { to: phone, body: `${msg}\nReply STOP to opt out` }); rec.channel = "sms"; rec.to_phone = toE164(phone); }
    else if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { await sendMail(env, { to: [email], subject: `How did we do? — ${plan.business}`, text: `${msg}\n\n— ${plan.business}` }); rec.channel = "email"; rec.to_email = email; }
    else throw new Error(phone ? "Texting isn't enabled yet — add an email, or we'll turn SMS on for you." : "Add a mobile number or email.");
  } catch (e) { rec.status = "error"; rec.error = String(e?.message || e).slice(0, 200); }
  await env.DB.prepare("INSERT INTO review_requests (id, plan_id, tenant_id, customer_name, to_phone, to_email, channel, status, error, sent_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)")
    .bind(rec.id, rec.plan_id, rec.tenant_id, rec.customer_name, rec.to_phone, rec.to_email, rec.channel, rec.status, rec.error, now()).run();
  if (rec.status === "error") throw new Error(rec.error);
  return rec;
}

export async function reviewRequests(env, planId, limit = 30) {
  const { results } = await env.DB.prepare("SELECT * FROM review_requests WHERE plan_id = ? ORDER BY sent_at DESC LIMIT ?").bind(planId, limit).all();
  return results || [];
}

// ---------- monthly re-audit (called from the hourly cron tick) ----------
export async function runMonthlyAudits(env, { limit = 5 } = {}) {
  if (!hasDB(env) || !env.GOOGLE_PLACES_API_KEY) return { ran: 0 };
  const { results } = await env.DB.prepare("SELECT * FROM plans WHERE status = 'active' AND place_id IS NOT NULL AND next_audit_at <= ?1 ORDER BY next_audit_at ASC LIMIT ?2").bind(now(), limit).all();
  let ran = 0; const errors = [];
  for (const r of results || []) {
    const plan = rowToPlan(r);
    try {
      const base = await runAudit(env, plan.place_id);
      const full = await runProExtras(env, base);
      const data = derived(full);
      const planText = await actionPlan(env, data.facts, { pro: true });
      const rec = await saveAudit(env, { place_id: plan.place_id, query: plan.business, source: "plan", score: full.score, grade: full.grade, data, plan: planText, full: cacheable(full), pro: true });
      const prev = plan.last_score;
      await env.DB.prepare("UPDATE plans SET last_audit_id = ?2, last_score = ?3, next_audit_at = ?4, updated_at = ?5 WHERE id = ?1").bind(plan.id, rec.id, full.score, now() + 30 * 86400, now()).run();
      const delta = prev != null ? full.score - prev : null;
      const link = reportLink(env, rec.id, rec.share_key);
      const rank = full.visibility?.queries?.[0];
      await sendMail(env, { to: [plan.email], reply_to: env.LEAD_TO, subject: `${plan.business}: ${full.score}/100 this month${delta != null ? ` (${delta >= 0 ? "+" : ""}${delta})` : ""}`,
        text: `Hi ${String(plan.name || "").split(" ")[0] || "there"},\n\nYour monthly audit is in: ${full.score}/100 (${full.grade})${delta != null ? `, ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)} from last month` : ""}.${rank ? `\nSearch "${rank.label}": ${rank.position ? `#${rank.position}` : "not in the top 20"}.` : ""}\n\nFull report: ${link}\nYour dashboard: ${portalLink(env, plan.portal_token)}\n\n${planText?.headline || ""}\n\nTop things to do this month:\n${(planText?.fixes || []).slice(0, 3).map((f, i) => `${i + 1}. ${f.title} — ${f.how}`).join("\n")}\n\nReply if you want me to handle any of these.\n\nBobby · Mesa Intelligence` });
      ran++;
    } catch (e) { errors.push(`${plan.business}: ${String(e?.message || e).slice(0, 120)}`); await env.DB.prepare("UPDATE plans SET next_audit_at = ?2 WHERE id = ?1").bind(plan.id, now() + 86400).run().catch(() => {}); }
  }
  return { ran, errors };
}

// ---------- helpers ----------
async function addKnowledge(env, tenantId, title, content) {
  const r = await env.DB.prepare("INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES (?, ?, ?, unixepoch())").bind(tenantId, title, content).run();
  const rowid = r?.meta?.last_row_id;
  if (rowid) await env.DB.prepare("INSERT INTO knowledge_fts(rowid, title, content) VALUES (?, ?, ?)").bind(rowid, title, content).run();
}
function knowledgeFor(business, place) {
  return [`${business}${place.typeLabel ? ` is a ${place.typeLabel.toLowerCase()}` : ""}${place.city ? ` in ${place.city}` : ""}.`, place.address ? `Address: ${place.address}.` : "", place.phone ? `Phone: ${place.phone}.` : "", place.website ? `Website: ${place.website}.` : "",
    Array.isArray(place.hours) && place.hours.length ? `Hours: ${place.hours.join("; ")}.` : "", place.rating ? `Google rating ${place.rating} from ${place.reviewCount} reviews.` : ""].filter(Boolean).join(" ");
}
function personaFor(business, vertical, place) {
  const role = { hvac: "dispatch assistant", restaurant: "host", dental: "front-desk assistant", legal: "intake assistant", plumbing: "dispatch assistant", roofing: "estimating assistant", electrical: "dispatch assistant", landscaping: "scheduling assistant", auto: "service advisor assistant", beauty: "front-desk assistant" }[vertical] || "front-desk assistant";
  return `You are the AI ${role} for ${business}${place.city ? `, a local business in ${place.city}` : ""}. Act like their best front-desk person: warm, quick, and always moving toward a booked appointment or a captured lead (name, phone, what they need). Keep replies to 2–4 sentences. Use only the knowledge provided; never invent prices, availability or policies — if you don't know, say so and offer a callback. Ask for a mobile number and confirm consent before promising any text messages.`;
}
function presetsFor(v) {
  return { hvac: ["My AC isn't cooling", "Do you do maintenance plans?", "Book a tune-up"], restaurant: ["Table for two tonight?", "Do you take reservations?", "Private party options?"], dental: ["I need a cleaning", "Do you take my insurance?", "Tooth pain — can I be seen today?"], legal: ["I need a consultation", "What do you charge?", "Do you handle my type of case?"], plumbing: ["Water heater is leaking", "Get a quote", "Drain is backed up"] }[v] || ["Hours and location?", "Get a quote", "Book an appointment"];
}
function defaultHours(weekdayDescriptions) {
  const H = { mon: ["08:00", "17:00"], tue: ["08:00", "17:00"], wed: ["08:00", "17:00"], thu: ["08:00", "17:00"], fri: ["08:00", "17:00"], sat: null, sun: null };
  if (!Array.isArray(weekdayDescriptions)) return H;
  for (const line of weekdayDescriptions) {
    const m = /^(\w{3})\w*:\s*(.+)$/.exec(line); if (!m) continue;
    const day = m[1].toLowerCase(); if (!(day in H)) continue;
    if (/closed/i.test(m[2])) { H[day] = null; continue; }
    const t = [...m[2].matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi)].map((x) => { let h = Number(x[1]) % 12; if (/pm/i.test(x[3])) h += 12; return `${String(h).padStart(2, "0")}:${x[2] || "00"}`; });
    if (t.length >= 2) H[day] = [t[0], t[t.length - 1]];
  }
  return H;
}
function sanitizeHours(h) {
  const out = {};
  for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) { const v = h[d]; out[d] = Array.isArray(v) && v.length === 2 && /^\d{2}:\d{2}$/.test(v[0]) && /^\d{2}:\d{2}$/.test(v[1]) ? [v[0], v[1]] : null; }
  return out;
}
async function sendMail(env, msg) {
  if (!env.RESEND_API_KEY || !msg.to?.[0]) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", ...msg }) });
  if (!res.ok) console.error("plan mail", res.status, await res.text().catch(() => ""));
  return res.ok;
}
