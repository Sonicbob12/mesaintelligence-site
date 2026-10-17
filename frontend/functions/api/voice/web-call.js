// POST /api/voice/web-call { tenant } → { access_token, call_id }
// Lets the website start a browser call (microphone) to a tenant's voice agent.
// Rate-limited: 3 calls per visitor per hour, and a global daily cap for demo tenants.

import { loadTenant } from "../../_lib/tenants.js";
import { createWebCall } from "../../_lib/retell.js";
import { hit } from "../../_lib/db.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (!env.RETELL_API_KEY) return json({ detail: "Voice demo not configured" }, 503);
  const b = await readJSON(request);
  const tenant = await loadTenant(env, b?.tenant);
  if (!tenant || !tenant.retell_agent_id) return json({ detail: "No voice agent for this business yet" }, 404);

  const ip = clientIp(request);
  const perIp = await hit(env, `webcall:${ip}`, 3600, Number(env.WEBCALL_IP_LIMIT_PER_HOUR || 3));
  if (!perIp.allowed) return json({ detail: "You've started a few calls already — try again in an hour, or book an audit." }, 429);
  if (tenant.demo) {
    const day = await hit(env, "webcall:daily", 86400, Number(env.WEBCALL_DAILY_CAP || 40));
    if (!day.allowed) return json({ detail: "The voice demo is resting for today. Book an audit and we'll call you instead." }, 429);
  }

  try {
    const call = await createWebCall(env, tenant, { ip, source: "site" });
    return json({ access_token: call.access_token, call_id: call.call_id });
  } catch (e) {
    console.error("web-call", e?.message || e);
    return json({ detail: "Could not start the call right now." }, 502);
  }
}
