// POST /api/chat — one conversational turn, streamed as server-sent events.
//
// Request:  { tenant: "desert-peak-hvac" | legacy key ("hvac"), conversation_id?: string, message: string }
//           (`vertical` and `session_id` are accepted as aliases for backward compatibility)
// Events:   data: {"type":"meta","conversation_id":...}
//           data: {"type":"delta","text":"..."}
//           data: {"type":"tool","name":"book_appointment","summary":"Booked ...","data":{...}}
//           data: {"type":"notice","text":"..."}       rate limit / turn cap
//           data: {"type":"error","message":"..."}
//           data: {"type":"done"}
//           data: [DONE]
//
// Env: ANTHROPIC_API_KEY (secret), ANTHROPIC_MODEL?, ANTHROPIC_WORKSPACE_ID?,
//      DB (D1 binding, optional — in-memory fallback without it),
//      DEMO_DAILY_CAP?, IP_LIMIT_PER_15MIN?

import { loadTenant } from "../_lib/tenants.js";
import { loadConversation } from "../_lib/db.js";
import { agentTurn, newConversation } from "../_lib/agent.js";
import { clientIp, json, readJSON, sse, sseHeaders } from "../_lib/http.js";

export async function onRequestPost({ request, env }) {
  const body = await readJSON(request);
  if (!body) return json({ detail: "Bad JSON" }, 400);

  const tenantKey = body.tenant || body.vertical;
  const tenant = await loadTenant(env, tenantKey);
  if (!tenant) return json({ detail: "Unknown tenant" }, 400);

  const message = String(body.message || "").trim();
  if (!message) return json({ detail: "Empty message" }, 400);
  if (!env.ANTHROPIC_API_KEY) return json({ detail: "Demo not configured" }, 503);

  const convId = body.conversation_id || body.session_id || null;
  let conversation = convId ? await loadConversation(env, convId) : null;
  if (conversation && conversation.tenant_id !== tenant.id) conversation = null; // don't let a session cross tenants
  if (!conversation) conversation = newConversation(tenant, "web"); // server-issued id; client picks it up from the "meta" event

  const ip = clientIp(request);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(enc.encode(sse(obj)));
      send({ type: "meta", conversation_id: conversation.id, tenant: tenant.id });
      try {
        for await (const evt of agentTurn({ env, tenant, conversation, message, channel: "web", ip })) {
          if (evt.type === "done") send({ type: "done" });
          else if (evt.type === "error") send({ type: "error", message: evt.message === "model_unavailable" ? "Our demo agent is catching its breath — please try again in a moment." : evt.message });
          else send(evt);
        }
      } catch (e) {
        console.error("chat error", e?.message || e);
        send({ type: "error", message: "Connection hiccup — please try again." });
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
