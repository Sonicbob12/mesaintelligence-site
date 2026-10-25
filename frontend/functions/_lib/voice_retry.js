// Retry queue for voice lines that didn't provision at signup.
//
// provisionPlan() buys the number inline; when Retell/Twilio hiccups (no number in the area code, a 5xx, a timeout)
// the signup still goes through and the welcome email says "within 1 business day". This picks those plans up on
// every hourly tick: active plan, tenant with no voice_number, signed up in the last 30 days. provisionVoiceLine is
// idempotent (reuses the agent, only buys what's missing), so a retry can't create a second agent or number.
//
//   success  → client gets the "your number is live" email with forwarding steps, Bobby gets a note
//   3 failures → one alert to Bobby ("do this one by hand in /admin → Voice"); retries continue up to 48 attempts
// State lives in plans.usage_json.voice_retry { attempts, last_at, last_error, alerted }.
// Env: VOICE_RETRY ("0" disables), VOICE_RETRY_MAX (48), LEAD_TO, RESEND_API_KEY / LEAD_FROM.

import { hasDB, now, safeJSON } from "./db.js";
import { loadTenant } from "./tenants.js";
import { provisionVoiceLine } from "./retell.js";
import { ensureUsageSchema } from "./usage.js";

const site = (env) => (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
const areaCodeOf = (raw) => { const d = String(raw || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1"); return d.length === 10 ? Number(d.slice(0, 3)) : null; };
const prettyPhone = (e164) => { const d = String(e164 || "").replace(/\D/g, "").replace(/^1(\d{10})$/, "$1"); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164; };

export async function pendingVoiceLines(env, { limit = 20 } = {}) {
  if (!hasDB(env)) return [];
  await ensureUsageSchema(env);
  const { results } = await env.DB.prepare(`SELECT p.* FROM plans p JOIN tenants t ON t.id = p.tenant_id
    WHERE p.status IN ('active','past_due') AND (t.voice_number IS NULL OR t.voice_number = '') AND p.created_at >= ?1 ORDER BY p.created_at ASC LIMIT ?2`).bind(now() - 30 * 86400, limit).all();
  return results || [];
}

export async function retryVoiceProvisioning(env, { limit = 5, force = false } = {}) {
  const out = { pending: 0, provisioned: [], failed: [], skipped: [] };
  if (!hasDB(env) || !env.RETELL_API_KEY || env.VOICE_RETRY === "0" || (!force && env.VOICE_AUTO_PROVISION === "0")) return out;
  const max = Number(env.VOICE_RETRY_MAX || 48);
  const plans = await pendingVoiceLines(env, { limit });
  out.pending = plans.length;
  for (const plan of plans) {
    const u = safeJSON(plan.usage_json, {});
    const st = { attempts: 0, ...(u.voice_retry || {}) };
    if (!force && st.attempts >= max) { out.skipped.push({ plan: plan.id, reason: "max attempts" }); continue; }
    if (!force && st.last_at && now() - st.last_at < 50 * 60) { out.skipped.push({ plan: plan.id, reason: "tried <1h ago" }); continue; }
    st.attempts += 1; st.last_at = now();
    try {
      const tenant = await loadTenant(env, plan.tenant_id);
      if (!tenant) throw new Error("tenant missing");
      const { number } = await provisionVoiceLine(env, tenant, site(env), { areaCode: areaCodeOf(plan.phone) });
      if (!number) throw new Error("no number returned");
      st.last_error = null; st.provisioned_at = now();
      await save(env, plan, u, st);
      await announce(env, plan, number).catch((e) => console.error("voice retry mail", e?.message || e));
      out.provisioned.push({ plan: plan.id, number, attempts: st.attempts });
    } catch (e) {
      st.last_error = String(e?.message || e).slice(0, 300);
      console.error("voice retry", plan.id, st.attempts, st.last_error);
      if (st.attempts >= 3 && !st.alerted && env.LEAD_TO) {
        await sendMail(env, { to: [env.LEAD_TO], subject: `⚠️ Voice line still not provisioned: ${plan.business} (${st.attempts} tries)`,
          text: `${plan.business} · ${plan.name} <${plan.email}>\nTenant: ${plan.tenant_id}\nLast error: ${st.last_error}\n\nThe hourly retry keeps going (up to ${max} tries), but the welcome email promised a number within 1 business day. Do it by hand: /admin → Voice → buy a number for this tenant (try a different area code), then the next tick emails the client automatically.` }).catch(() => {});
        st.alerted = now();
      }
      await save(env, plan, u, st);
      out.failed.push({ plan: plan.id, attempts: st.attempts, error: st.last_error });
    }
  }
  return out;
}

async function save(env, plan, u, st) {
  await env.DB.prepare("UPDATE plans SET usage_json = ?2, updated_at = ?3 WHERE id = ?1").bind(plan.id, JSON.stringify({ ...u, voice_retry: st }), now()).run();
}

async function announce(env, plan, number) {
  const pretty = prettyPhone(number), raw = String(number).replace(/\D/g, "").replace(/^1/, "");
  const first = String(plan.name || "").split(" ")[0] || "there";
  await sendMail(env, { to: [plan.email], bcc: env.LEAD_TO ? [env.LEAD_TO] : undefined, reply_to: env.LEAD_TO, subject: `${plan.business}: your AI phone line is live — ${pretty}`,
    text: `Hi ${first},\n\nYour number is ready: ${pretty}. Call it now and hear it answer as ${plan.business}.\n\nTo put it to work, forward your business line to it when you can't answer:\n• Most carriers: from your business phone dial *72 then ${raw}, hang up at the tone. (*73 turns it off.)\n• Or set "forward when busy / no answer" in your phone's call settings so it only picks up what you miss.\n\nEvery call it takes is emailed to you, bookings text the customer a confirmation, and your dashboard shows the minute count: ${site(env)}/portal?t=${plan.portal_token}\n\nSorry for the wait on this one. Reply if anything's off.\n\nBobby Lloyd\nMesa Intelligence · Las Cruces, NM · (575) 254-1185` });
}

async function sendMail(env, msg) {
  if (!env.RESEND_API_KEY || !msg.to?.[0]) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", ...msg }) });
  if (!res.ok) console.error("voice retry mail", res.status, await res.text().catch(() => ""));
  return res.ok;
}
