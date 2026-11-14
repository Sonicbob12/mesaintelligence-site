// /api/manage?t=<token> — the business owner's private tracker (opened from /manage/?t=…).
//   GET                                        → business, listings (with buyer fields), leads, recent calls/chats, upcoming visits
//   POST { op:"item", item:{…} }               → add / update a listing
//   POST { op:"delete_item", id }              → remove a listing
//   POST { op:"lead", id, status?, notes?, item_id? } → update a lead's pipeline status / notes
import { loadTenant } from "../_lib/tenants.js";
import { tenantForManageToken, listItems, upsertItem, deleteItem, listLeads, updateLead, ITEM_STATUSES, LEAD_STATUSES } from "../_lib/tracker.js";
import { hasDB, now } from "../_lib/db.js";
import { json, readJSON } from "../_lib/http.js";

async function auth(request, env) {
  const t = new URL(request.url).searchParams.get("t") || "";
  const tid = await tenantForManageToken(env, t);
  return tid ? loadTenant(env, tid) : null;
}

export async function onRequestGet({ request, env }) {
  const tenant = await auth(request, env);
  if (!tenant) return json({ detail: "This link isn't valid. Ask Mesa Intelligence for a new one." }, 401);
  const [items, leads] = await Promise.all([listItems(env, tenant.id, { includePrivate: true }), listLeads(env, tenant.id)]);
  let calls = [], visits = [];
  if (hasDB(env)) {
    calls = (await env.DB.prepare("SELECT id, channel, external_id, summary, turns, created_at, updated_at FROM conversations WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 60").bind(tenant.id).all()).results || [];
    visits = (await env.DB.prepare("SELECT id, customer_name, phone, email, service, start_at, end_at, notes, status FROM bookings WHERE tenant_id = ? AND start_at > ? ORDER BY start_at LIMIT 50").bind(tenant.id, now() - 86400).all()).results || [];
  }
  return json({
    business: { id: tenant.id, name: tenant.name, timezone: tenant.timezone, phone: tenant.voice_number || null },
    item_statuses: ITEM_STATUSES, lead_statuses: LEAD_STATUSES, items, leads, calls, visits,
  });
}

export async function onRequestPost({ request, env }) {
  const tenant = await auth(request, env);
  if (!tenant) return json({ detail: "This link isn't valid." }, 401);
  const b = await readJSON(request);
  try {
    if (b?.op === "item") return json({ ok: true, item: await upsertItem(env, tenant.id, b.item || {}) });
    if (b?.op === "delete_item" && b.id) { await deleteItem(env, tenant.id, String(b.id)); return json({ ok: true }); }
    if (b?.op === "lead" && b.id) { await updateLead(env, tenant.id, String(b.id), b); return json({ ok: true }); }
  } catch (e) { return json({ detail: String(e?.message || e).slice(0, 200) }, 400); }
  return json({ detail: "Unknown action" }, 400);
}
