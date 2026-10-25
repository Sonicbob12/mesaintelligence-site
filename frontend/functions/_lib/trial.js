// Trial check-ins — the two emails that turn a 14-day trial into a paying client.
//
//   day 3   "Here's what your line did this week" — calls, minutes, bookings, messages since signup. If the line has
//           taken NO calls, the email is about the one thing that's almost always wrong: forwarding isn't on.
//   T-4     "Your trial ends <date>" — same numbers for the whole trial, the exact charge and date, how to cancel.
//           Honest and early beats a surprise charge and a dispute. Sent from trial_end (Stripe) minus 4 days.
//
// Runs from the hourly tick (runTrialCheckins) during business hours Mountain time; each check-in is sent once per
// plan (usage_json.checkins). Windows are wide (day 3–5, T-4–T-1) so a missed tick doesn't skip the email.
// Bobby gets a bcc of every one. Env: PLAN_CHECKINS ("0" disables), PLAN_PRICE_USD, PLAN_FOUNDING_USD (149),
// STRIPE_FOUNDING_PRICE_ID, STRIPE_PLAN_ANNUAL_PRICE_ID, PLAN_ANNUAL_USD, LEAD_TO.

import { hasDB, now, safeJSON } from "./db.js";
import { ensureUsageSchema, usageFor, billableMinutes } from "./usage.js";
import { localDate } from "./time.js";

const DAY = 86400;
const site = (env) => (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
const fmtDay = (s) => new Date(s * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Denver" });
const prettyPhone = (e164) => { const d = String(e164 || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1"); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164 || ""; };
const digits = (e164) => String(e164 || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");

// Activity since `since` for a tenant: what the client sees as "what it did".
export async function activitySince(env, tenantId, since) {
  const out = { calls: 0, minutes: 0, bookings: 0, leads: 0, chats: 0, latest: [] };
  if (!hasDB(env) || !tenantId) return out;
  await ensureUsageSchema(env);
  const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];
  for (const r of await q("SELECT seconds FROM call_usage WHERE tenant_id = ?1 AND started_at >= ?2", tenantId, since)) { out.calls += 1; out.minutes += billableMinutes(r.seconds || 0); }
  out.bookings = (await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE tenant_id = ?1 AND created_at >= ?2 AND status != 'cancelled'").bind(tenantId, since).first())?.n || 0;
  out.leads = (await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ?1 AND created_at >= ?2").bind(tenantId, since).first())?.n || 0;
  out.chats = (await env.DB.prepare("SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ?1 AND created_at >= ?2 AND channel != 'voice'").bind(tenantId, since).first())?.n || 0;
  out.latest = await q("SELECT customer_name, service, start_at FROM bookings WHERE tenant_id = ?1 AND created_at >= ?2 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 3", tenantId, since);
  return out;
}

export function priceLine(env, plan) {
  if (plan?.price_id && env.STRIPE_FOUNDING_PRICE_ID && plan.price_id === env.STRIPE_FOUNDING_PRICE_ID) return `$${Number(env.PLAN_FOUNDING_USD || 149)} a month (founding-client rate)`;
  if (plan?.interval === "year" || (plan?.price_id && env.STRIPE_PLAN_ANNUAL_PRICE_ID && plan.price_id === env.STRIPE_PLAN_ANNUAL_PRICE_ID)) return `$${Number(env.PLAN_ANNUAL_USD || 2388)} for the year`;
  return `$${Number(env.PLAN_PRICE_USD || 249)} a month`;
}

// Which check-in (if any) is due for this plan right now.
export function dueCheckin(plan, at = now()) {
  const sent = safeJSON(plan?.usage_json, {}).checkins || {};
  const age = at - (plan?.created_at || at);
  if (!sent.day3 && age >= 3 * DAY && age < 6 * DAY) return "day3";
  if (!sent.pre_end && plan?.trial_end && plan.trial_end - at <= 4 * DAY && plan.trial_end - at > 12 * 3600) return "pre_end";
  return null;
}

export async function runTrialCheckins(env, { limit = 50, at = now(), force = false } = {}) {
  const out = { checked: 0, sent: [], errors: [] };
  if (!hasDB(env) || env.PLAN_CHECKINS === "0") return out;
  const hour = Number(localDate(new Date(at * 1000), "America/Denver").hh);
  if (!force && (hour < 9 || hour > 17)) return { ...out, skipped: "outside 9–5 Mountain" };
  await ensureUsageSchema(env);
  const { results } = await env.DB.prepare("SELECT * FROM plans WHERE status = 'active' AND tenant_id IS NOT NULL AND email IS NOT NULL AND created_at >= ?1 ORDER BY created_at DESC LIMIT ?2").bind(at - 60 * DAY, limit).all();
  for (const plan of results || []) {
    out.checked += 1;
    const which = dueCheckin(plan, at);
    if (!which) continue;
    try {
      const tenant = await env.DB.prepare("SELECT voice_number, services_json FROM tenants WHERE id = ?").bind(plan.tenant_id).first();
      const act = await activitySince(env, plan.tenant_id, plan.created_at);
      const msg = which === "day3" ? day3Email(env, plan, tenant, act) : preEndEmail(env, plan, tenant, act);
      const ok = await sendMail(env, { to: [plan.email], bcc: env.LEAD_TO ? [env.LEAD_TO] : undefined, reply_to: env.LEAD_TO, ...msg });
      if (!ok) throw new Error("mail failed");
      const u = safeJSON(plan.usage_json, {});
      u.checkins = { ...(u.checkins || {}), [which]: at };
      await env.DB.prepare("UPDATE plans SET usage_json = ?2, updated_at = ?3 WHERE id = ?1").bind(plan.id, JSON.stringify(u), now()).run();
      out.sent.push({ plan: plan.id, which, calls: act.calls });
    } catch (e) { out.errors.push({ plan: plan.id, which, error: String(e?.message || e).slice(0, 200) }); console.error("trial checkin", plan.id, which, e?.message || e); }
  }
  return out;
}

export function day3Email(env, plan, tenant, act) {
  const first = String(plan.name || "").split(" ")[0] || "there";
  const portal = `${site(env)}/portal?t=${plan.portal_token}`;
  const num = prettyPhone(tenant?.voice_number), raw = digits(tenant?.voice_number);
  const services = safeJSON(tenant?.services_json, []);
  const sig = `\n\nBobby Lloyd\nMesa Intelligence · Las Cruces, NM · (575) 254-1185`;
  if (!act.calls) {
    return { subject: `${plan.business}: your AI line hasn't taken a call yet — 2-minute fix`,
      text: `Hi ${first},\n\nThree days in, and your line${num ? ` at ${num}` : ""} hasn't taken a call yet. Nine times out of ten that means your business line isn't forwarding to it, so every missed call is still going to voicemail.\n\nThe fix takes two minutes:\n1. Call ${num || "your AI number"} from your cell right now and hear it answer as ${plan.business}.\n2. From your business phone, dial *72${raw ? ` then ${raw}` : ""} (most carriers). Hang up when you hear the tone. To turn it off later, dial *73.\n   Prefer it to answer only when you can't? Set "forward when busy / no answer" in your phone's call settings instead, and it never touches a call you pick up.\n3. Call your business number from another phone. If the AI answers, you're done.\n\nIf you'd rather do it together, reply with a time or call me at (575) 254-1185 and we'll have it live in one call.${services.length ? "" : `\n\nOne more thing worth five minutes: add your services and prices in your dashboard so the line quotes the right thing: ${portal}`}${sig}` };
  }
  const booked = act.latest.length ? `\n\nMost recent: ${act.latest.map((b) => `${b.customer_name || "a customer"}${b.service ? ` — ${b.service}` : ""}`).join("; ")}.` : "";
  return { subject: `${plan.business}: ${act.calls} call${act.calls === 1 ? "" : "s"} answered in your first 3 days`,
    text: `Hi ${first},\n\nQuick check-in from your first three days:\n\n• ${act.calls} call${act.calls === 1 ? "" : "s"} answered (${act.minutes} minute${act.minutes === 1 ? "" : "s"})\n• ${act.bookings} job${act.bookings === 1 ? "" : "s"} booked\n• ${act.leads} message${act.leads === 1 ? "" : "s"} taken for you to call back${act.chats ? `\n• ${act.chats} website chat${act.chats === 1 ? "" : "s"}` : ""}${booked}\n\nEvery one of those would have rung out before. Your dashboard has the full list and the minute count: ${portal}\n\nTwo things that make it noticeably better:\n1. Services and prices in the dashboard, so it quotes and books the right thing${services.length ? " (you've started this — add anything it's getting wrong)" : ""}.\n2. Forwarding after hours too, if it's only on during the day. The 6 PM calls are the ones that go to the next guy.\n\nAnything it said that you'd say differently? Reply and tell me; I tune it the same day.${sig}` };
}

export function preEndEmail(env, plan, tenant, act) {
  const first = String(plan.name || "").split(" ")[0] || "there";
  const portal = `${site(env)}/portal?t=${plan.portal_token}`;
  const when = fmtDay(plan.trial_end);
  const sig = `\n\nBobby Lloyd\nMesa Intelligence · Las Cruces, NM · (575) 254-1185`;
  const tally = act.calls
    ? `Since you signed up, your line has:\n• answered ${act.calls} call${act.calls === 1 ? "" : "s"} (${act.minutes} minute${act.minutes === 1 ? "" : "s"})\n• booked ${act.bookings} job${act.bookings === 1 ? "" : "s"}\n• taken ${act.leads} message${act.leads === 1 ? "" : "s"}${act.chats ? `\n• handled ${act.chats} website chat${act.chats === 1 ? "" : "s"}` : ""}`
    : `Your line hasn't taken a call yet, which usually means your business number isn't forwarding to it. If you want to see it work before deciding, reply and I'll set up forwarding with you in one two-minute call, and move your trial end out so you get a fair look.`;
  return { subject: `${plan.business}: your free trial ends ${when}`,
    text: `Hi ${first},\n\nYour 14-day trial ends ${when}.\n\n${tally}\n\nWhat happens next: nothing you need to do. On ${when} the card you entered is charged ${priceLine(env, plan)}, and the line, number and dashboard keep running exactly as they are.\n\nNot for you? Open your dashboard → Billing → cancel, any time before ${when}, and there's no charge: ${portal}\nOr reply "cancel" and I'll do it for you.\n\nEither way, thanks for giving it a real try. If something kept it from earning its keep, I'd like to hear what.${sig}` };
}

async function sendMail(env, msg) {
  if (!env.RESEND_API_KEY || !msg.to?.[0]) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", ...msg }) });
  if (!res.ok) console.error("trial mail", res.status, await res.text().catch(() => ""));
  return res.ok;
}
