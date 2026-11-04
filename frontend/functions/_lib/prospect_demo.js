// Personalized demo line ("Hear your line") — every outbound prospect gets a link to /hear?a=&k=&o= where they
// click Call and hear THEIR business answered: "Thanks for calling Snell's Air Conditioning…".
//
// One shared Retell agent serves every prospect. Its prompt uses Retell dynamic variables ({{business_name}},
// {{trade_noun}}, {{city}}, {{hours_line}}, {{services_line}}, {{emergency_line}}), filled per call from the audit
// + outreach row, so there is no per-prospect agent or phone number to pay for.
//
// The agent is created lazily on the first call (and re-synced when PROMPT_VERSION changes); its ids live in the
// `app_settings` table, which self-applies. Nothing is booked during a demo call — the agent says so in one line.
// Call events go to /api/voice/prospect-webhook, which saves the transcript and emails Bobby (LEAD_TO) that a
// prospect just tried their line — the hottest signal the outbound engine produces.
//
// Env: RETELL_API_KEY (required), DEMO_LINE_VOICE_ID (else RETELL_VOICE_ID), DEMO_LINE_DAILY_CAP (30),
// DEMO_LINE_IP_PER_HOUR (4), DEMO_LINE_PER_AUDIT_PER_DAY (6), DEMO_LINKS=0 removes the link from emails.

import { retell, nowFor } from "./retell.js";
import { loadAudit } from "./audit.js";
import { hasDB, hit, now } from "./db.js";

export const PROSPECT_TENANT = "prospect-demo";
export const PROMPT_VERSION = "2026-11-03.1";
const site = (env) => (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");

export const demoLinesEnabled = (env) => Boolean(env.RETELL_API_KEY) && env.DEMO_LINKS !== "0";
export function demoLink(env, auditId, shareKey, outreachId) {
  return `${site(env)}/hear?a=${encodeURIComponent(auditId)}&k=${encodeURIComponent(shareKey)}${outreachId ? `&o=${encodeURIComponent(outreachId)}` : ""}`;
}

// ---------- schema (self-applying) ----------
let schemaReady = false;
export async function ensureDemoSchema(env) {
  if (schemaReady || !hasDB(env)) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
  for (const col of ["demo_calls INTEGER NOT NULL DEFAULT 0", "demo_at INTEGER"]) {
    try { await env.DB.prepare(`ALTER TABLE outreach ADD COLUMN ${col}`).run(); }
    catch (e) { if (!/duplicate column|no such table/i.test(String(e?.message || e))) throw e; }
  }
  schemaReady = true;
}
async function getSetting(env, k) {
  const row = await env.DB.prepare("SELECT v FROM app_settings WHERE k = ?").bind(k).first();
  try { return row ? JSON.parse(row.v) : null; } catch { return null; }
}
async function setSetting(env, k, v) {
  await env.DB.prepare("INSERT INTO app_settings (k, v, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .bind(k, JSON.stringify(v), now()).run();
}

// ---------- trade facts ----------
const TRADES = {
  hvac: { noun: "heating and air conditioning company", services: "AC repair, furnace and heater repair, tune-ups, refrigerated air and evaporative coolers, and estimates on new systems",
    emergency: "No cooling in extreme heat, no heat in freezing weather, or an elderly person or infant in a hot house is urgent — offer the first available slot. If they smell gas, tell them to leave the house and call the gas company first, then take their details." },
  plumbing: { noun: "plumbing company", services: "leaks, clogged drains and sewer lines, water heaters, fixtures, and repipes",
    emergency: "An active leak or burst pipe is urgent — tell them to shut off the main water valve (usually near the meter or where the line enters the house) and offer the first available slot. Sewage backing up is urgent. If they smell gas, tell them to leave the house and call the gas company first." },
  electrical: { noun: "electrical contractor", services: "electrical repairs, breaker and panel upgrades, lighting, new circuits and outlets, and EV chargers",
    emergency: "Sparking, a burning smell, or a hot outlet or panel is urgent — tell them to stay clear and switch off that breaker only if it is safe, and to call 911 if there is smoke or fire. Offer the first available slot." },
  roofing: { noun: "roofing company", services: "leak repairs, roof inspections, re-roofs, flat and pitched roofs, and stucco and gutters",
    emergency: "An active leak during or after a storm is urgent — suggest a bucket and moving valuables, and offer the first available inspection or tarp slot." },
  landscaping: { noun: "landscaping company", services: "yard maintenance, irrigation and sprinkler repair, tree trimming, xeriscape and new installs",
    emergency: "A broken irrigation line flooding the yard is urgent — tell them where the irrigation shutoff usually is and offer the first available slot." },
  contractor: { noun: "contractor", services: "remodels, repairs, concrete, fencing and other projects — the owner reviews each job and follows up with an estimate",
    emergency: "Anything unsafe — water, structural damage, an open hole — is urgent: offer the first available visit." },
  other: { noun: "local service business", services: "the work they're calling about — take the details and the owner will follow up",
    emergency: "If something sounds unsafe or urgent, offer the first available slot and say the owner will call right back." },
};
const TRADE_RE = [
  [/hvac|heating|cooling|air\s*cond|a\/c|refrigerat|furnace|swamp|evaporative|mechanical/i, "hvac"],
  [/plumb|rooter|drain|sewer|water\s*heater/i, "plumbing"], [/electric|wiring/i, "electrical"], [/roof|gutter|stucco/i, "roofing"],
  [/landscap|lawn|tree|irrigat|sprinkler|xeriscap|yard/i, "landscaping"], [/contract|construct|remodel|handyman|builder|concrete|paving|fence|painting|garage door/i, "contractor"],
];
export function tradeKey(category, ...hints) {
  if (category && TRADES[category]) return category;
  const s = hints.filter(Boolean).join(" ");
  for (const [re, k] of TRADE_RE) if (re.test(s)) return k;
  return "other";
}

const DAY = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
function hoursLine(weekdayDescriptions) {
  if (Array.isArray(weekdayDescriptions) && weekdayDescriptions.length) return weekdayDescriptions.join("; ").replace(/ | /g, " ");
  return "the office is open weekdays during business hours (exact hours not listed) — you answer whenever the owner can't";
}

// The variables for one call. `audit` from loadAudit (full may be null once the 30-day cache expires); `o` = outreach row or null.
export function demoVars(env, audit, o) {
  const place = audit?.full?.place || {};
  const name = (o?.business || audit?.business_name || place.name || audit?.query || "the business").trim();
  const key = tradeKey(o?.category, place.typeLabel, name, audit?.data?.facts?.category);
  const t = TRADES[key];
  const city = (place.city || cityFromMarket(o?.city) || "the area").trim();
  return {
    key,
    vars: {
      business_name: name.slice(0, 120), trade_noun: t.noun, city,
      hours_line: hoursLine(place.hours), services_line: t.services, emergency_line: t.emergency,
      current_time: nowFor("America/Denver"),
    },
  };
}
function cityFromMarket(m) {
  if (!m) return "";
  return String(m).split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

// ---------- the agent ----------
export function prospectPrompt(env) {
  const price = Number(env.PLAN_PRICE_USD || 249), trial = Number(env.PLAN_TRIAL_DAYS ?? 14), setup = 299, mins = Number(env.PLAN_INCLUDED_MINUTES || 500);
  return [
    "You are the phone receptionist for {{business_name}}, a {{trade_noun}} in {{city}}. You answer when the owner and crew can't get to the phone — nights, weekends, and while they're on a job.",
    "",
    "## About this call",
    "This is a live demo that Mesa Intelligence set up so the owner of {{business_name}} can hear how their own line would sound. The caller is most likely the owner or someone from the business playing a customer. Treat them exactly like a real customer unless they step out of the role.",
    "",
    "## Business facts",
    "Today: {{current_time}} (Mountain time).",
    "Hours: {{hours_line}}.",
    "Typical work: {{services_line}}.",
    "Urgent calls: {{emergency_line}}",
    "You do not know this business's prices, warranties or service area limits. Never quote a price or promise one — say the office will confirm pricing when they call back.",
    "",
    "## How to handle a call",
    "1. Greet, then find out what's going on in one or two questions. Sound like a capable local dispatcher, not a call center.",
    "2. Decide if it's urgent using the urgent-call rules above.",
    "3. Collect: first and last name, the best callback number (read it back digit by digit), the service address, and anything the tech should know (gate code, pets, age of the unit).",
    "4. Offer two specific windows, for example tomorrow between eight and ten or between one and three, or the first available slot if it's urgent. Confirm the one they choose back to them.",
    "5. After you confirm, say this once, in one sentence: \"In the live version this goes straight onto your calendar, the customer gets a text confirmation, and you get an email summary of the call.\" Then ask if there's anything else and wrap up.",
    "Nothing is actually scheduled in this demo. Never claim a real technician is coming.",
    "",
    "## If they ask about the service itself",
    `Answer briefly and plainly, then offer to keep role-playing. It's an AI phone line from Mesa Intelligence, run by Bobby Lloyd in Las Cruces. It answers when they can't, books jobs into their calendar, texts the customer a confirmation and a reminder, and emails a summary of every call. They keep their number — they forward unanswered calls to the line. It's free for ${trial} days, then $${price} a month with ${mins} minutes included, plus a one-time $${setup} setup on monthly plans (waived on annual). Setup is a 15-minute call with Bobby — the button on the page they're on books it. Don't push; one mention is enough.`,
    "If asked whether you are an AI, say yes in one sentence and carry on.",
    "",
    "## Phone manner",
    "- You are on a live phone call. Short, natural sentences — one or two at a time. No lists, no symbols, no markdown.",
    "- Ask one question at a time and wait for the answer.",
    "- Don't repeat the business name in every sentence.",
    "- Keep the whole call under four minutes. When they're done, thank them and use end_call.",
  ].join("\n");
}

async function syncAgent(env) {
  const saved = (await getSetting(env, "prospect_demo_agent")) || {};
  if (saved.agent_id && saved.version === PROMPT_VERSION) return saved;
  const llmBody = {
    general_prompt: prospectPrompt(env),
    begin_message: "Thanks for calling {{business_name}}, how can I help you?",
    general_tools: [{ type: "end_call", name: "end_call", description: "End the call once the caller has what they need and has said goodbye." }],
    model_temperature: 0.3,
    ...(env.RETELL_MODEL ? { model: env.RETELL_MODEL } : {}),
  };
  let llm_id = saved.llm_id || null;
  const upsertLlm = async (body) => {
    if (llm_id) await retell(env, "PATCH", `/update-retell-llm/${llm_id}`, body);
    else llm_id = (await retell(env, "POST", "/create-retell-llm", body)).llm_id;
  };
  try { await upsertLlm(llmBody); }
  catch (e) { if (env.RETELL_MODEL && /model/i.test(String(e.message))) { delete llmBody.model; await upsertLlm(llmBody); } else throw e; }

  const agentBody = {
    agent_name: "Prospect demo line (Mesa)",
    response_engine: { type: "retell-llm", llm_id },
    voice_id: env.DEMO_LINE_VOICE_ID || env.RETELL_VOICE_ID || "11labs-Adrian",
    language: "en-US",
    webhook_url: `${site(env)}/api/voice/prospect-webhook`,
    webhook_events: ["call_ended", "call_analyzed"],
    max_call_duration_ms: 6 * 60 * 1000,
    end_call_after_silence_ms: 20000,
    post_call_analysis_data: [
      { type: "system-presets", name: "call_summary" },
      { type: "boolean", name: "asked_about_service", description: "True if the caller asked about the AI phone line itself — price, setup, how it works, the trial." },
    ],
  };
  let agent_id = saved.agent_id || null;
  if (agent_id) await retell(env, "PATCH", `/update-agent/${agent_id}`, agentBody);
  else agent_id = (await retell(env, "POST", "/create-agent", agentBody)).agent_id;
  const out = { llm_id, agent_id, version: PROMPT_VERSION };
  await setSetting(env, "prospect_demo_agent", out);
  return out;
}

// Validate the link, rate-limit, and return what the page needs. Throws { status, message } on refusal.
export async function demoContext(env, { a, k, o }) {
  if (!hasDB(env)) throw err(503, "Demo lines need the database.");
  await ensureDemoSchema(env);
  const audit = await loadAudit(env, a);
  if (!audit || !k || audit.share_key !== k) throw err(404, "This demo link isn't valid. Email hello@mesaintelligence.ai and Bobby will send a fresh one.");
  let outreach = null;
  if (o) outreach = await env.DB.prepare("SELECT * FROM outreach WHERE id = ? AND audit_id = ?").bind(o, a).first();
  const { key, vars } = demoVars(env, audit, outreach);
  return { audit, outreach, trade: key, vars };
}

export async function startDemoCall(env, ctx, ip) {
  if (!env.RETELL_API_KEY) throw err(503, "The demo line isn't switched on right now.");
  const perIp = await hit(env, `demoline:ip:${ip}`, 3600, Number(env.DEMO_LINE_IP_PER_HOUR || 4));
  if (!perIp.allowed) throw err(429, "You've started a few calls already — try again in an hour, or book 15 minutes with Bobby.");
  const perAudit = await hit(env, `demoline:a:${ctx.audit.id}`, 86400, Number(env.DEMO_LINE_PER_AUDIT_PER_DAY || 6));
  if (!perAudit.allowed) throw err(429, "This demo line has had a busy day — try again tomorrow, or book 15 minutes with Bobby.");
  const day = await hit(env, "demoline:daily", 86400, Number(env.DEMO_LINE_DAILY_CAP || 30));
  if (!day.allowed) throw err(429, "The demo lines are resting for today. Book 15 minutes with Bobby and he'll call you instead.");

  const agent = await syncAgent(env);
  const call = await retell(env, "POST", "/v3/create-web-call", {
    agent_id: agent.agent_id,
    metadata: { kind: "prospect_demo", audit_id: ctx.audit.id, outreach_id: ctx.outreach?.id || "", business: ctx.vars.business_name, ip },
    retell_llm_dynamic_variables: ctx.vars,
  });
  return call;
}

// Admin: force a re-sync (e.g. after changing the voice).
export async function resyncAgent(env) {
  await ensureDemoSchema(env);
  const saved = (await getSetting(env, "prospect_demo_agent")) || {};
  await setSetting(env, "prospect_demo_agent", { ...saved, version: "force" });
  return syncAgent(env);
}

// ---------- after the call ----------
export async function recordDemoCall(env, call, event) {
  await ensureDemoSchema(env);
  const md = call.metadata || {};
  const seconds = Number.isFinite(call.duration_ms) ? Math.round(call.duration_ms / 1000)
    : call.start_timestamp && call.end_timestamp ? Math.round((call.end_timestamp - call.start_timestamp) / 1000) : 0;

  // Transcript into conversations (tenant "prospect-demo") so /admin → Activity shows it.
  const messages = [];
  for (const t of call.transcript_object || []) {
    if (t.role === "user" && t.content) messages.push({ role: "user", content: t.content });
    else if (t.role === "agent" && t.content) messages.push({ role: "assistant", content: [{ type: "text", text: t.content }] });
  }
  try {
    await env.DB.prepare(`INSERT INTO conversations (id, tenant_id, channel, external_id, messages_json, turns, created_at, updated_at, summary)
      VALUES (?1, ?2, 'voice', ?3, ?4, ?5, ?6, ?6, ?7)
      ON CONFLICT(id) DO UPDATE SET messages_json = excluded.messages_json, turns = excluded.turns, updated_at = excluded.updated_at, summary = COALESCE(excluded.summary, summary)`)
      .bind(call.call_id, PROSPECT_TENANT, md.audit_id || null, JSON.stringify(messages), messages.filter((m) => m.role === "user").length, now(), call.call_analysis?.call_summary || null).run();
  } catch (e) { console.error("demo transcript", e?.message || e); }

  if (event !== "call_analyzed") return { seconds, alerted: false };
  // Count and alert once per call (Retell can redeliver a webhook).
  const first = await hit(env, `demoline:done:${call.call_id}`, 86400 * 7, 1);
  if (!first.allowed) return { seconds, alerted: false };
  if (md.outreach_id) {
    await env.DB.prepare("UPDATE outreach SET demo_calls = COALESCE(demo_calls, 0) + 1, demo_at = ?2, updated_at = ?2 WHERE id = ?1").bind(md.outreach_id, now()).run().catch((e) => console.error("demo outreach", e?.message || e));
  }
  // Calls under 10 seconds are hang-ups — logged, not emailed.
  if (seconds < 10) return { seconds, alerted: false };
  const alerted = await alertBobby(env, call, md, seconds);
  return { seconds, alerted };
}

async function alertBobby(env, call, md, seconds) {
  if (!env.RESEND_API_KEY || !env.LEAD_TO) return false;
  let o = null;
  if (md.outreach_id) o = await env.DB.prepare("SELECT business, email, phone, city, category, rank_label, rank_position, audit_id FROM outreach WHERE id = ?").bind(md.outreach_id).first().catch(() => null);
  const audit = md.audit_id ? await env.DB.prepare("SELECT id, share_key, contact_email, contact_phone FROM audits WHERE id = ?").bind(md.audit_id).first().catch(() => null) : null;
  const biz = o?.business || md.business || "A prospect";
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const asked = call.call_analysis?.custom_analysis_data?.asked_about_service === true;
  const transcript = (call.transcript || "").slice(0, 6000);
  const report = audit ? `${site(env)}/audit/${audit.id}?k=${audit.share_key}` : "";
  const lines = [
    `${biz} just called their demo line (${mmss}).${asked ? " They asked about the service itself — price, setup or how it works." : ""}`,
    "",
    o?.phone || audit?.contact_phone ? `Phone: ${o?.phone || audit?.contact_phone}` : "",
    o?.email || audit?.contact_email ? `Email: ${o?.email || audit?.contact_email}` : "",
    o ? `From outbound: ${o.category || ""} · ${o.city || ""}${o.rank_label ? ` · ${o.rank_position ? `#${o.rank_position}` : "unranked"} for "${o.rank_label}"` : ""}` : "From an audit link (not outbound)",
    report ? `Their report: ${report}` : "",
    "",
    "Call them today while it's fresh. Opener: \"Saw you tried the line I set up for you — what did you think of how it handled the call?\"",
    "",
    call.call_analysis?.call_summary ? `Summary: ${call.call_analysis.call_summary}` : "",
    "",
    "Transcript:",
    transcript || "(no transcript)",
  ].filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", to: [env.LEAD_TO], subject: `🔥 ${biz} tried their demo line${asked ? " — asked about pricing" : ""}`, text: lines }),
    });
    if (!res.ok) console.error("demo alert", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) { console.error("demo alert", e?.message || e); return false; }
}

function err(status, message) { const e = new Error(message); e.status = status; return e; }
