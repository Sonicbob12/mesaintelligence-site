// POST /api/voice/inbound — Retell inbound-call webhook (set per phone number).
// Tells Retell which business this call is for and stamps the current local time
// so the agent can turn "tomorrow" into a date.

import { verifyRetell, nowFor } from "../../_lib/retell.js";
import { tenantByVoiceNumber } from "../../_lib/tenants.js";
import { json } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!(await verifyRetell(env, raw, request.headers.get("x-retell-signature")))) return json({ detail: "Unauthorized" }, 401);
  let body; try { body = JSON.parse(raw); } catch { return json({}, 200); }
  const inbound = body?.call_inbound || {};
  const tenant = await tenantByVoiceNumber(env, inbound.to_number);
  if (!tenant) return json({ call_inbound: {} });
  return json({
    call_inbound: {
      ...(tenant.retell_agent_id ? { override_agent_id: tenant.retell_agent_id } : {}),
      dynamic_variables: { current_time: nowFor(tenant.timezone), tenant: tenant.id, business: tenant.name },
      metadata: { tenant: tenant.id, from: inbound.from_number || "" },
    },
  });
}
