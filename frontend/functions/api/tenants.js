// GET /api/tenants            → public config for all active tenants (used by the demo widget)
// GET /api/tenants?id=<id>    → one tenant (used by the embed page)
// Only client-safe fields are returned; personas and escalation rules stay server-side.

import { listTenants, loadTenant, publicTenant } from "../_lib/tenants.js";
import { json } from "../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const t = await loadTenant(env, id);
    return t ? json(publicTenant(t), 200, { "access-control-allow-origin": "*" }) : json({ detail: "Not found" }, 404);
  }
  const all = await listTenants(env);
  return json(all.filter((t) => t.active !== false).map(publicTenant), 200, { "access-control-allow-origin": "*" });
}
