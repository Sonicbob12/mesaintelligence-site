// Voice minutes: tracking, the included allowance, overage billing and usage alerts.
//
//   Retell webhook (call_ended / call_analyzed) → recordCallUsage(): one row per call in call_usage (upsert, so the
//   second event just refreshes the duration). Minutes are billed the way carriers do it: each call rounded UP to
//   the next whole minute, summed over the Stripe billing period.
//
//   Hourly tick → runUsageBilling(): for every active plan, used vs included (PLAN_INCLUDED_MINUTES, 500).
//     • 80% and 100% → one email each to the client per period (and a copy to LEAD_TO)
//     • past the allowance, and not in trial → a Stripe invoice item for the unbilled overage minutes at
//       PLAN_OVERAGE_CENTS (25). It lands on the next subscription invoice, so the client sees one bill.
//       usage_json.billed_minutes remembers what's been billed this period, and the idempotency key makes a retry safe.
//     Nothing is ever cut off: a receptionist that stops answering is the one failure a client would notice.
//
//   Billing period = the Stripe subscription's current_period_start/end (saved by updatePlanFromSubscription).
//   Before the first subscription event arrives (or without one) it falls back to monthly periods anchored on the
//   plan's signup day, which is what Stripe does too.
//
// Env: PLAN_INCLUDED_MINUTES (500), PLAN_OVERAGE_CENTS (25), PLAN_OVERAGE_BILLING ("0" disables the invoice items,
// alerts still go out), LEAD_TO (Bobby's copy), RESEND_API_KEY / LEAD_FROM for mail.

import { stripe } from "./stripe.js";
import { hasDB, now, safeJSON } from "./db.js";

export const includedMinutes = (env) => Number(env.PLAN_INCLUDED_MINUTES || 500);
export const overageCents = (env) => Number(env.PLAN_OVERAGE_CENTS || 25);
const site = (env) => (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");

// ---------- schema (self-applying; see migrations/009-usage.sql) ----------
let schemaReady = false;
export async function ensureUsageSchema(env) {
  if (schemaReady || !hasDB(env)) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS call_usage (call_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, kind TEXT, direction TEXT, from_number TEXT, started_at INTEGER NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS call_usage_tenant ON call_usage (tenant_id, started_at)").run();
  for (const col of ["period_start INTEGER", "period_end INTEGER", "trial_end INTEGER", "usage_json TEXT NOT NULL DEFAULT '{}'"]) {
    try { await env.DB.prepare(`ALTER TABLE plans ADD COLUMN ${col}`).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e?.message || e))) throw e; }
  }
  schemaReady = true;
}

// ---------- recording ----------
export function callSeconds(call) {
  if (!call) return 0;
  if (Number.isFinite(call.duration_ms) && call.duration_ms > 0) return Math.round(call.duration_ms / 1000);
  if (call.start_timestamp && call.end_timestamp && call.end_timestamp > call.start_timestamp) return Math.round((call.end_timestamp - call.start_timestamp) / 1000);
  return 0;
}
export const billableMinutes = (seconds) => (seconds > 0 ? Math.ceil(seconds / 60) : 0);

export async function recordCallUsage(env, tenant, call) {
  if (!hasDB(env) || !tenant?.id || !call?.call_id) return null;
  await ensureUsageSchema(env);
  const seconds = callSeconds(call);
  const started = call.start_timestamp ? Math.floor(call.start_timestamp / 1000) : now();
  await env.DB.prepare(`INSERT INTO call_usage (call_id, tenant_id, kind, direction, from_number, started_at, seconds, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
    ON CONFLICT(call_id) DO UPDATE SET seconds = MAX(seconds, excluded.seconds), direction = COALESCE(excluded.direction, direction), from_number = COALESCE(excluded.from_number, from_number)`)
    .bind(call.call_id, tenant.id, call.call_type || null, call.direction || null, call.from_number || null, started, seconds, now()).run();
  return { call_id: call.call_id, seconds, minutes: billableMinutes(seconds) };
}

// ---------- periods ----------
// Monthly periods anchored on `anchor` (unix seconds): the one containing `at`.
export function anchoredPeriod(anchor, at = now()) {
  const a = new Date(anchor * 1000), t = new Date(at * 1000);
  let start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(a.getUTCDate(), daysIn(t.getUTCFullYear(), t.getUTCMonth())), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds()));
  if (start > t) { const m = t.getUTCMonth() - 1, y = t.getUTCFullYear() + (m < 0 ? -1 : 0), mm = (m + 12) % 12; start = new Date(Date.UTC(y, mm, Math.min(a.getUTCDate(), daysIn(y, mm)), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds())); }
  const ny = start.getUTCMonth() === 11 ? start.getUTCFullYear() + 1 : start.getUTCFullYear(), nm = (start.getUTCMonth() + 1) % 12;
  const end = new Date(Date.UTC(ny, nm, Math.min(a.getUTCDate(), daysIn(ny, nm)), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds()));
  return { start: Math.floor(start / 1000), end: Math.floor(end / 1000), source: "anchor" };
}
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function currentPeriod(plan, at = now()) {
  if (plan?.period_start && plan?.period_end && plan.period_start <= at && at < plan.period_end) return { start: plan.period_start, end: plan.period_end, source: "stripe" };
  return anchoredPeriod(plan?.created_at || at, at);
}

// Stripe moved current_period_* from the subscription to its items in newer API versions; accept both.
export function periodFromSubscription(sub) {
  const item = sub?.items?.data?.[0];
  const start = sub?.current_period_start ?? item?.current_period_start ?? null;
  const end = sub?.current_period_end ?? item?.current_period_end ?? null;
  return { start: start || null, end: end || null, trial_end: sub?.trial_end || null };
}

// ---------- reading ----------
export async function usageFor(env, plan, at = now()) {
  const period = currentPeriod(plan, at);
  const included = includedMinutes(env), rate = overageCents(env);
  let seconds = 0, calls = 0, minutes = 0;
  if (hasDB(env) && plan?.tenant_id) {
    await ensureUsageSchema(env);
    const { results } = await env.DB.prepare("SELECT seconds FROM call_usage WHERE tenant_id = ?1 AND started_at >= ?2 AND started_at < ?3").bind(plan.tenant_id, period.start, period.end).all();
    for (const r of results || []) { calls += 1; seconds += r.seconds || 0; minutes += billableMinutes(r.seconds || 0); }
  }
  const u = safeJSON(plan?.usage_json, {});
  const samePeriod = u.period_start === period.start;
  const overage = Math.max(0, minutes - included);
  const trialing = Boolean(plan?.trial_end && plan.trial_end > at);
  return {
    period, included, minutes, seconds, calls, overage, rate_cents: rate, trialing,
    billed_minutes: samePeriod ? Number(u.billed_minutes || 0) : 0,
    alerted: samePeriod ? u.alerted || {} : {},
    pct: included ? Math.min(999, Math.round((minutes / included) * 100)) : 0,
    overage_usd: Number(((overage * rate) / 100).toFixed(2)),
  };
}

// Per-call history for the portal (this period, newest first).
export async function recentCalls(env, plan, limit = 25) {
  if (!hasDB(env) || !plan?.tenant_id) return [];
  await ensureUsageSchema(env);
  const period = currentPeriod(plan);
  const { results } = await env.DB.prepare("SELECT call_id, kind, direction, from_number, started_at, seconds FROM call_usage WHERE tenant_id = ?1 AND started_at >= ?2 ORDER BY started_at DESC LIMIT ?3").bind(plan.tenant_id, period.start, limit).all();
  return (results || []).map((r) => ({ ...r, minutes: billableMinutes(r.seconds || 0) }));
}

// ---------- billing + alerts (hourly) ----------
export async function runUsageBilling(env, { limit = 50 } = {}) {
  const out = { checked: 0, alerted: 0, billed: 0, errors: [] };
  if (!hasDB(env)) return out;
  await ensureUsageSchema(env);
  const { results } = await env.DB.prepare("SELECT * FROM plans WHERE status IN ('active','past_due') AND tenant_id IS NOT NULL ORDER BY updated_at DESC LIMIT ?1").bind(limit).all();
  for (const plan of results || []) {
    out.checked += 1;
    try {
      const u = await usageFor(env, plan);
      const state = { period_start: u.period.start, billed_minutes: u.billed_minutes, alerted: { ...u.alerted } };
      let changed = false;
      for (const level of [80, 100]) {
        if (u.pct >= level && !state.alerted[level]) {
          await sendUsageAlert(env, plan, u, level).catch((e) => console.error("usage alert", e?.message || e));
          state.alerted[level] = now(); changed = true; out.alerted += 1;
        }
      }
      const unbilled = u.overage - u.billed_minutes;
      if (unbilled > 0 && !u.trialing && env.PLAN_OVERAGE_BILLING !== "0" && plan.stripe_customer && env.STRIPE_SECRET_KEY) {
        const total = u.billed_minutes + unbilled;
        await stripe(env, "POST", "/invoiceitems", {
          customer: plan.stripe_customer, currency: "usd", amount: unbilled * u.rate_cents,
          subscription: plan.stripe_subscription || undefined,
          description: `Voice minutes over the ${u.included} included — ${unbilled} min × $${(u.rate_cents / 100).toFixed(2)} (${fmtDay(u.period.start)}–${fmtDay(u.period.end)})`,
          metadata: { plan_id: plan.id, tenant_id: plan.tenant_id, period_start: String(u.period.start), minutes: String(unbilled) },
        }, `ov-${plan.id}-${u.period.start}-${total}`);
        state.billed_minutes = total; state.last_billed_at = now(); changed = true; out.billed += 1;
      }
      if (changed || safeJSON(plan.usage_json, {}).period_start !== state.period_start) {
        await env.DB.prepare("UPDATE plans SET usage_json = ?2, updated_at = ?3 WHERE id = ?1").bind(plan.id, JSON.stringify(state), now()).run();
      }
    } catch (e) { out.errors.push({ plan: plan.id, error: String(e?.message || e).slice(0, 200) }); console.error("usage billing", plan.id, e?.message || e); }
  }
  return out;
}

const fmtDay = (s) => new Date(s * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });

async function sendUsageAlert(env, plan, u, level) {
  const first = String(plan.name || "").split(" ")[0] || "there";
  const portal = `${site(env)}/portal?t=${plan.portal_token}`;
  const rate = `$${(u.rate_cents / 100).toFixed(2)}`;
  const subject = level >= 100 ? `${plan.business}: your ${u.included} included minutes are used up this month` : `${plan.business}: ${u.pct}% of your voice minutes used`;
  const body = level >= 100
    ? `Hi ${first},\n\nGood news first: your line has handled ${u.calls} calls and ${u.minutes} minutes since ${fmtDay(u.period.start)}, so it's clearly earning its keep.\n\nThat puts you past the ${u.included} minutes included in your plan. Nothing changes on your end: the line keeps answering every call. ${u.trialing ? "You're still in your free trial, so there's no charge for the extra minutes this period." : `Minutes past ${u.included} are ${rate} each and show up as one line on your next invoice (${fmtDay(u.period.end)}).`}\n\nYour dashboard shows the running count: ${portal}\n\nIf your call volume is going to stay here, reply and I'll put you on a plan with more minutes built in for less than the overage.\n\nBobby Lloyd\nMesa Intelligence · (575) 254-1185`
    : `Hi ${first},\n\nA heads-up: your AI line has used ${u.minutes} of the ${u.included} minutes included this period (${u.pct}%), across ${u.calls} calls since ${fmtDay(u.period.start)}.\n\nIf you go past ${u.included} the line keeps answering; extra minutes are ${rate} each${u.trialing ? " (free during your trial)" : " on your next invoice"}. Your period resets ${fmtDay(u.period.end)}.\n\nDashboard: ${portal}\n\nBobby Lloyd\nMesa Intelligence · (575) 254-1185`;
  await sendMail(env, { to: [plan.email], reply_to: env.LEAD_TO, subject, text: body });
  if (env.LEAD_TO) await sendMail(env, { to: [env.LEAD_TO], subject: `📈 ${plan.business} at ${u.pct}% of minutes (${u.minutes}/${u.included})${u.trialing ? " — trialing, not billed" : ""}`, text: `${plan.business} · ${plan.email}\n${u.calls} calls, ${u.minutes} min this period (${fmtDay(u.period.start)}–${fmtDay(u.period.end)}). Overage so far: ${u.overage} min = $${u.overage_usd}.\nClient email sent (${level}%).` });
}

async function sendMail(env, msg) {
  if (!env.RESEND_API_KEY || !msg.to?.[0]) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", ...msg }) });
  if (!res.ok) console.error("usage mail", res.status, await res.text().catch(() => ""));
  return res.ok;
}
