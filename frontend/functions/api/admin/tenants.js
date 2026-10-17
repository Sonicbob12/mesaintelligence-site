// Admin: tenants.  Authorization: Bearer <ADMIN_TOKEN>
//   GET    /api/admin/tenants              list (full config)
//   PUT    /api/admin/tenants              upsert one tenant (JSON body; see _lib/tenants.js for shape)
//   DELETE /api/admin/tenants?id=<id>      deactivate (soft delete)
// Requires the D1 binding; demo tenants can be overridden by upserting the same id.

import { hasDB } from "../../_lib/db.js";
import { listTenants, tenantToRow } from "../../_lib/tenants.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

const UPSERT = `INSERT INTO tenants (id, name, vertical, timezone, greeting, presets_json, persona, hours_json, slot_minutes, services_json, escalation, notify_email, sms_number, demo, active, voice_number, transfer_number, voice_id)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
ON CONFLICT(id) DO UPDATE SET name=?2, vertical=?3, timezone=?4, greeting=?5, presets_json=?6, persona=?7, hours_json=?8, slot_minutes=?9,
  services_json=?10, escalation=?11, notify_email=?12, sms_number=?13, demo=?14, active=?15,
  voice_number=COALESCE(?16, voice_number), transfer_number=?17, voice_id=?18`;

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  if (request.method === "GET") return json(await listTenants(env));
  if (!hasDB(env)) return json({ detail: "D1 not bound — add the DB binding first" }, 503);

  if (request.method === "PUT") {
    const t = await readJSON(request);
    if (!t || !/^[a-z0-9-]{3,40}$/.test(t.id || "")) return json({ detail: "id must be 3-40 chars: a-z, 0-9, dashes" }, 400);
    if (!t.name || !t.persona) return json({ detail: "name and persona are required" }, 400);
    await env.DB.prepare(UPSERT).bind(...tenantToRow(t)).run();
    return json({ ok: true, id: t.id });
  }

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return json({ detail: "id required" }, 400);
    await env.DB.prepare("UPDATE tenants SET active = 0 WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return json({ detail: "Method not allowed" }, 405);
}
