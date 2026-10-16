// Admin: knowledge docs.  Authorization: Bearer <ADMIN_TOKEN>
//   GET    /api/admin/knowledge?tenant=<id>        list docs (id, title, length)
//   POST   /api/admin/knowledge                    { tenant, title, content }  → add one doc
//   POST   /api/admin/knowledge  { tenant, docs: [{title, content}, ...] }      → add many
//   DELETE /api/admin/knowledge?id=<rowid>         remove one
// Docs should be short and single-topic (hours, pricing, one policy each) — retrieval pulls the top 4 per message.

import { hasDB } from "../../_lib/db.js";
import { json, readJSON, requireAdmin } from "../../_lib/http.js";

export async function onRequest({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (!hasDB(env)) return json({ detail: "D1 not bound — add the DB binding first" }, 503);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const tenant = url.searchParams.get("tenant");
    if (!tenant) return json({ detail: "tenant required" }, 400);
    const { results } = await env.DB.prepare("SELECT id, title, length(content) AS chars, created_at FROM knowledge WHERE tenant_id = ? ORDER BY id").bind(tenant).all();
    return json(results || []);
  }

  if (request.method === "POST") {
    const b = await readJSON(request);
    if (!b?.tenant) return json({ detail: "tenant required" }, 400);
    const docs = Array.isArray(b.docs) ? b.docs : [{ title: b.title, content: b.content }];
    const clean = docs.filter((d) => d && d.title && d.content).map((d) => ({ title: String(d.title).slice(0, 200), content: String(d.content).slice(0, 8000) }));
    if (!clean.length) return json({ detail: "title and content required" }, 400);
    const stmt = env.DB.prepare("INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES (?, ?, ?, unixepoch())");
    await env.DB.batch(clean.map((d) => stmt.bind(b.tenant, d.title, d.content)));
    return json({ ok: true, added: clean.length });
  }

  if (request.method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    if (!id) return json({ detail: "id required" }, 400);
    await env.DB.prepare("DELETE FROM knowledge WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return json({ detail: "Method not allowed" }, 405);
}
