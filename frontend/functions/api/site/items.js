// GET /api/site/items?tenant=<id> — public listings for a client website (no buyer/private fields).
import { loadTenant } from "../../_lib/tenants.js";
import { listItems } from "../../_lib/tracker.js";
import { json } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const tid = new URL(request.url).searchParams.get("tenant");
  const tenant = await loadTenant(env, tid);
  if (!tenant || tenant.demo) return json({ detail: "Not found" }, 404, { "access-control-allow-origin": "*" });
  const items = await listItems(env, tenant.id);
  return json({ items, phone: tenant.voice_number || null }, 200, { "access-control-allow-origin": "*", "cache-control": "public, max-age=30" });
}
