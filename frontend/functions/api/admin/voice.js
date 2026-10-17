// Admin: voice agents.  Authorization: Bearer <ADMIN_TOKEN>.  Needs RETELL_API_KEY in Pages secrets.
//   GET  /api/admin/voice                      → Retell phone numbers you own + which tenant each is assigned to
//   POST /api/admin/voice { tenant }           → create/update the Retell LLM + agent for that tenant (idempotent)
//   POST /api/admin/voice { tenant, phone_number: "+15755550123" }
//                                              → same, then point that number at the agent and set the inbound webhook
//   POST /api/admin/voice { tenant, test_call: true, to: "+1..." }  → place an outbound test call from the tenant's number

import { loadTenant, listTenants } from "../../_lib/tenants.js";
import { provisionVoiceAgent, assignNumber, listNumbers, retell, nowFor } from "../../_lib/retell.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (!env.RETELL_API_KEY) return json({ detail: "RETELL_API_KEY is not set in Cloudflare Pages secrets" }, 503);
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;

  if (request.method === "GET") {
    const [numbers, tenants] = await Promise.all([listNumbers(env), listTenants(env)]);
    const byNumber = Object.fromEntries(tenants.filter((t) => t.voice_number).map((t) => [t.voice_number, t.id]));
    return json({
      origin,
      numbers: (numbers || []).map((n) => ({ number: n.phone_number, pretty: n.phone_number_pretty, agent: n.inbound_agents?.[0]?.agent_id || n.inbound_agent_id || null, tenant: byNumber[n.phone_number] || null, inbound_webhook: n.inbound_webhook_url || null })),
      agents: tenants.filter((t) => t.retell_agent_id).map((t) => ({ tenant: t.id, agent_id: t.retell_agent_id, voice_number: t.voice_number })),
    });
  }

  if (request.method !== "POST") return json({ detail: "Method not allowed" }, 405);
  const b = await readJSON(request);
  const tenant = await loadTenant(env, b?.tenant);
  if (!tenant) return json({ detail: "Unknown tenant" }, 400);

  try {
    if (b.test_call) {
      if (!tenant.voice_number) return json({ detail: "Tenant has no phone number assigned yet" }, 400);
      const call = await retell(env, "POST", "/v2/create-phone-call", {
        from_number: tenant.voice_number, to_number: b.to, metadata: { tenant: tenant.id, test: true },
        retell_llm_dynamic_variables: { current_time: nowFor(tenant.timezone), tenant: tenant.id },
      });
      return json({ ok: true, call_id: call.call_id });
    }

    const ids = await provisionVoiceAgent(env, tenant, origin);
    let number = null;
    if (b.phone_number) {
      number = String(b.phone_number).trim();
      if (!/^\+1\d{10}$/.test(number)) return json({ detail: "phone_number must be E.164, e.g. +15755550123" }, 400);
      await assignNumber(env, tenant, number, ids.agent_id);
      await retell(env, "PATCH", `/update-phone-number/${encodeURIComponent(number)}`, { inbound_webhook_url: `${origin}/api/voice/inbound` });
    }
    return json({ ok: true, tenant: tenant.id, ...ids, phone_number: number || tenant.voice_number || null, tool_url: `${origin}/api/voice/tool` });
  } catch (e) {
    console.error("voice setup", e?.message || e);
    return json({ detail: String(e?.message || e).slice(0, 500), retell: e?.data || null }, e?.status === 401 ? 502 : 500);
  }
}
