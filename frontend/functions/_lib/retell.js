// Retell AI helpers: request verification, API client, and building a voice agent
// for a tenant out of the same persona/knowledge/tools the chat engine uses.

import { TOOL_DEFS } from "./tools.js";
import { demoKnowledge } from "./tenants.js";
import { hasDB } from "./db.js";

const API = (env) => env.RETELL_BASE_URL || "https://api.retellai.com";

// ---- signature: X-Retell-Signature: v=<ms>,d=<hex hmac-sha256(rawBody + ms, apiKey)> ----
export async function verifyRetell(env, rawBody, header) {
  if (!env.RETELL_API_KEY) return false;
  const m = /^v=(\d+),d=([0-9a-f]+)$/i.exec(header || "");
  if (!m) return false;
  const [, ts, digest] = m;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.RETELL_API_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody + ts));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== digest.length) return false;
  let r = 0;
  for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ digest.toLowerCase().charCodeAt(i);
  return r === 0;
}

// ---- API client ----
export async function retell(env, method, path, body) {
  const res = await fetch(API(env) + path, {
    method,
    headers: { authorization: `Bearer ${env.RETELL_API_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) { const e = new Error(`Retell ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

// ---- prompt + tool config for a tenant ----
export async function voicePrompt(env, tenant) {
  const docs = await allKnowledge(env, tenant.id);
  const hours = Object.entries(tenant.hours || {}).map(([d, h]) => `${d}: ${h ? `${h[0]}–${h[1]}` : "closed"}`).join(", ");
  const services = (tenant.services || []).map((s) => `${s.name} — ${s.minutes} min${s.price ? `, $${s.price}` : ""}${s.note ? ` (${s.note})` : ""}`).join("\n");
  const knowledge = docs.map((d) => `### ${d.title}\n${d.content}`).join("\n\n").slice(0, 9000);
  return [
    tenant.persona,
    "",
    "## Business facts",
    `Business: ${tenant.name}. Timezone: ${tenant.timezone}. Today's date and time: {{current_time}}.`,
    `Hours: ${hours}.`,
    services ? `Services:\n${services}` : "",
    "",
    "## Knowledge",
    knowledge || "(none)",
    "",
    "## Escalation rules",
    tenant.escalation || "Escalate when the caller asks for a person or the request is outside what you know.",
    "",
    "## Phone manner",
    "- You are on a live phone call. Speak in short, natural sentences — one or two at a time. No lists, no markdown, no symbols.",
    "- Ask one question at a time and wait for the answer.",
    "- Read phone numbers back digit by digit and confirm names by spelling if unclear.",
    "- When you take a mobile number, tell the caller in one short sentence that they will get a text confirmation and can reply STOP to opt out.",
    "- Use check_availability before offering times; offer two or three options, not a list. Confirm the exact day and time before calling book_appointment.",
    "- Never invent prices, policies, or availability. If you don't know, say so and offer a callback with capture_lead.",
    "- Convert relative dates (tomorrow, next Tuesday) to YYYY-MM-DD using today's date above when calling tools.",
    "- When the caller is done, thank them and use end_call.",
    tenant.demo ? "- This is a live demo built by Mesa Intelligence for a fictional business. If asked whether you're an AI or whether the business is real, say so in one sentence, then carry on." : `- If asked, you are the AI assistant for ${tenant.name}; say so plainly.`,
  ].filter((l) => l !== undefined && l !== null).join("\n");
}

export function voiceTools(env, tenant, siteOrigin) {
  const url = `${siteOrigin}/api/voice/tool`;
  const custom = TOOL_DEFS.map((t) => ({
    type: "custom",
    name: t.name,
    description: t.description,
    url,
    method: "POST",
    parameters: t.input_schema,
    speak_during_execution: t.name === "check_availability" || t.name === "book_appointment",
    execution_message_description: t.name === "check_availability" ? "Say a short filler like 'One moment while I check the schedule.'" : t.name === "book_appointment" ? "Say 'Let me get that booked for you.'" : undefined,
    speak_after_execution: true,
    timeout_ms: 15000,
  }));
  const tools = [...custom, { type: "end_call", name: "end_call", description: "End the call once the caller has what they need and has said goodbye." }];
  if (tenant.transfer_number) {
    tools.push({
      type: "transfer_call", name: "transfer_to_office",
      description: "Transfer the caller to a human at the office during business hours when they insist on a person or the matter is urgent.",
      transfer_destination: { type: "predefined", number: tenant.transfer_number },
      transfer_option: { type: "cold_transfer" },
    });
  }
  return tools;
}

// Create or update the Retell LLM + agent for a tenant. Returns { llm_id, agent_id }.
export async function provisionVoiceAgent(env, tenant, siteOrigin) {
  const general_prompt = await voicePrompt(env, tenant);
  const general_tools = voiceTools(env, tenant, siteOrigin);
  const llmBody = {
    general_prompt,
    begin_message: tenant.greeting || `Thanks for calling ${tenant.name}, how can I help?`,
    general_tools,
    model_temperature: 0.2,
    ...(env.RETELL_MODEL ? { model: env.RETELL_MODEL } : {}),
  };

  let llm_id = tenant.retell_llm_id || null;
  try {
    if (llm_id) await retell(env, "PATCH", `/update-retell-llm/${llm_id}`, llmBody);
    else llm_id = (await retell(env, "POST", "/create-retell-llm", llmBody)).llm_id;
  } catch (e) {
    // Unknown model name → retry with Retell's default model.
    if (env.RETELL_MODEL && /model/i.test(String(e.message))) {
      delete llmBody.model;
      if (llm_id) await retell(env, "PATCH", `/update-retell-llm/${llm_id}`, llmBody);
      else llm_id = (await retell(env, "POST", "/create-retell-llm", llmBody)).llm_id;
    } else throw e;
  }

  const agentBody = {
    agent_name: `${tenant.name} (Mesa)`,
    response_engine: { type: "retell-llm", llm_id },
    voice_id: tenant.voice_id || env.RETELL_VOICE_ID || "11labs-Adrian",
    language: "en-US",
    webhook_url: `${siteOrigin}/api/voice/webhook`,
    webhook_events: ["call_ended", "call_analyzed"],
    max_call_duration_ms: 10 * 60 * 1000,
    end_call_after_silence_ms: 30000,
    post_call_analysis_data: [
      { type: "system-presets", name: "call_summary" },
      { type: "system-presets", name: "call_successful" },
      { type: "system-presets", name: "user_sentiment" },
      { type: "string", name: "caller_name", description: "The caller's name if they gave it, else empty." },
      { type: "string", name: "callback_phone", description: "A phone number the caller gave for callback, else empty." },
      { type: "boolean", name: "needs_followup", description: "True if a human should call this person back (unresolved request, escalation, or they asked for a callback)." },
    ],
  };

  let agent_id = tenant.retell_agent_id || null;
  if (agent_id) await retell(env, "PATCH", `/update-agent/${agent_id}`, agentBody);
  else agent_id = (await retell(env, "POST", "/create-agent", agentBody)).agent_id;

  if (hasDB(env)) {
    await env.DB.prepare("UPDATE tenants SET retell_llm_id = ?, retell_agent_id = ? WHERE id = ?").bind(llm_id, agent_id, tenant.id).run();
  }
  return { llm_id, agent_id };
}

// Point a purchased Retell number at the tenant's agent and remember it.
// Retell replaced inbound_agent_id with a weighted agent list (March 2026); the entry needs the agent's version.
export async function assignNumber(env, tenant, number, agentId) {
  let agent_version = 0;
  try { const a = await retell(env, "GET", `/get-agent/${agentId}`); if (Number.isFinite(Number(a?.version))) agent_version = Number(a.version); } catch (e) { console.error("get-agent", e?.message || e); }
  await retell(env, "PATCH", `/update-phone-number/${encodeURIComponent(number)}`, {
    inbound_agents: [{ agent_id: agentId, agent_version, weight: 1 }],
    nickname: tenant.name,
  });
  if (hasDB(env)) await env.DB.prepare("UPDATE tenants SET voice_number = ? WHERE id = ?").bind(number, tenant.id).run();
}

export async function listNumbers(env) {
  return retell(env, "GET", "/list-phone-numbers");
}

// A short-lived token so the website can start a browser call to this agent.
export async function createWebCall(env, tenant, metadata = {}) {
  return retell(env, "POST", "/v2/create-web-call", {
    agent_id: tenant.retell_agent_id,
    metadata: { tenant: tenant.id, ...metadata },
    retell_llm_dynamic_variables: { current_time: nowFor(tenant.timezone) },
  });
}

export function nowFor(tz) {
  const d = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const long = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
  return `${long} (${iso})`;
}

async function allKnowledge(env, tenantId) {
  if (hasDB(env)) {
    try {
      const { results } = await env.DB.prepare("SELECT title, content FROM knowledge WHERE tenant_id = ? ORDER BY id").bind(tenantId).all();
      if (results && results.length) return results;
    } catch (e) { console.error("knowledge read", e?.message || e); }
  }
  return demoKnowledge(tenantId);
}
