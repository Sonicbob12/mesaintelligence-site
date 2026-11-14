// Admin: owner tracker links + listings.  Authorization: Bearer <ADMIN_TOKEN>
//   POST { tenant }                         → new private /manage link for that business (send it to the owner)
//   POST { tenant, items:[{title,…}] }       → also bulk-add / update listings (same shape as /api/manage op:item)
import { loadTenant } from "../../_lib/tenants.js";
import { createManageLink, upsertItem } from "../../_lib/tracker.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const b = await readJSON(request);
  const tenant = await loadTenant(env, b?.tenant);
  if (!tenant || tenant.demo) return json({ detail: "Unknown tenant" }, 400);
  const saved = [];
  for (const it of Array.isArray(b.items) ? b.items.slice(0, 40) : []) saved.push(await upsertItem(env, tenant.id, it));
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;
  const link = b.link === false ? null : `${origin}/manage/?t=${await createManageLink(env, tenant.id, b.label || null)}`;
  return json({ ok: true, tenant: tenant.id, link, items: saved.map((i) => ({ id: i.id, title: i.title })) });
}
