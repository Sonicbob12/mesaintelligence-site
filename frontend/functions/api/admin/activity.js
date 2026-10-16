// Admin: what the agents have done.  Authorization: Bearer <ADMIN_TOKEN>
//   GET /api/admin/activity?tenant=<id>&limit=50       bookings, leads, handoffs, recent conversations
//   GET /api/admin/activity?conversation=<id>          one conversation as a plain transcript

import { loadConversation, recentActivity } from "../../_lib/db.js";
import { transcript } from "../../_lib/agent.js";
import { json, requireAdmin } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  const convId = url.searchParams.get("conversation");
  if (convId) {
    const c = await loadConversation(env, convId);
    if (!c) return json({ detail: "Not found" }, 404);
    return json({ id: c.id, tenant_id: c.tenant_id, channel: c.channel, turns: c.turns, transcript: transcript(c.messages) });
  }
  const tenant = url.searchParams.get("tenant") || null;
  const limit = Math.min(200, Number(url.searchParams.get("limit") || 50));
  return json(await recentActivity(env, tenant, limit));
}
