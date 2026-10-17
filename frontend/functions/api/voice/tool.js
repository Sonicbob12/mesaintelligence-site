// POST /api/voice/tool — Retell "custom function" endpoint.
// Retell sends { name, args, call }. We run the same tools the chat agent uses and
// return { result } for the voice model to speak. Verified with X-Retell-Signature.

import { verifyRetell } from "../../_lib/retell.js";
import { loadTenant, tenantByVoiceNumber } from "../../_lib/tenants.js";
import { runTool } from "../../_lib/tools.js";
import { json } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!(await verifyRetell(env, raw, request.headers.get("x-retell-signature")))) return json({ result: "Unauthorized" }, 401);

  let body; try { body = JSON.parse(raw); } catch { return json({ result: "Bad JSON" }, 400); }
  const { name, args = {}, call = {} } = body || {};
  const tenant = await tenantForCall(env, call);
  if (!tenant) return json({ result: "This line isn't configured for a business yet. Apologize and offer to take a message." });

  const ctx = { tenant, conversationId: call.call_id || null, channel: "voice" };
  const out = await runTool(env, ctx, name, args);
  return json({ result: out.result });
}

export async function tenantForCall(env, call) {
  const id = call?.metadata?.tenant || call?.retell_llm_dynamic_variables?.tenant;
  if (id) { const t = await loadTenant(env, id); if (t) return t; }
  if (call?.to_number) { const t = await tenantByVoiceNumber(env, call.to_number); if (t) return t; }
  if (call?.agent_id) { const t = await tenantByAgentId(env, call.agent_id); if (t) return t; }
  return null;
}

async function tenantByAgentId(env, agentId) {
  if (!env.DB) return null;
  const { rowToTenant } = await import("../../_lib/tenants.js");
  const row = await env.DB.prepare("SELECT * FROM tenants WHERE retell_agent_id = ? AND active = 1").bind(agentId).first();
  return row ? rowToTenant(row) : null;
}
