// Client tracker: the listings a client sells (puppies, units, packages…) and the people asking about them.
// Used by client websites (public listings + application form) and the owner's private /manage page.
//
//   site_items     one row per listing: title, subtitle (e.g. "Male · Blue & rust"), status
//                  (available | reserved | sold | hidden), price, photo URL, public notes, and private
//                  buyer fields (buyer_name, buyer_phone, deposit, go_home, private_notes) never sent to the public feed.
//   leads          existing table; gains status / notes / details_json / item_id / updated_at for pipeline tracking.
//   manage_links   token → tenant, the owner's private link to /manage (no password to remember).
// Schema self-applies on first use, like _lib/usage.js — nothing to run by hand.

import { hasDB, id, now, safeJSON } from "./db.js";

let schemaReady = false;

export async function ensureTrackerSchema(env) {
  if (schemaReady || !hasDB(env)) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_items (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL, subtitle TEXT, status TEXT NOT NULL DEFAULT 'available', price TEXT, photo TEXT, notes TEXT,
    buyer_name TEXT, buyer_phone TEXT, deposit TEXT, go_home TEXT, private_notes TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS site_items_tenant ON site_items (tenant_id, sort)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS manage_links (token TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, label TEXT, created_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)").run();
  for (const col of ["status TEXT NOT NULL DEFAULT 'new'", "notes TEXT", "details_json TEXT", "item_id TEXT", "updated_at INTEGER"]) {
    try { await env.DB.prepare(`ALTER TABLE leads ADD COLUMN ${col}`).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e?.message || e))) throw e; }
  }
  schemaReady = true;
}

export const ITEM_STATUSES = ["available", "reserved", "sold", "hidden"];
export const LEAD_STATUSES = ["new", "contacted", "approved", "waitlist", "deposit", "picked_up", "not_a_fit"];

const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);

// ---------- items ----------
export async function listItems(env, tenantId, { includePrivate = false } = {}) {
  if (!hasDB(env)) return [];
  await ensureTrackerSchema(env);
  const { results } = await env.DB.prepare("SELECT * FROM site_items WHERE tenant_id = ? ORDER BY sort, created_at").bind(tenantId).all();
  const rows = results || [];
  if (includePrivate) return rows;
  return rows.filter((r) => r.status !== "hidden").map(({ id, title, subtitle, status, price, photo, notes, go_home }) => ({ id, title, subtitle, status, price, photo, notes, go_home }));
}

export async function upsertItem(env, tenantId, it) {
  await ensureTrackerSchema(env);
  const status = ITEM_STATUSES.includes(it.status) ? it.status : "available";
  const title = clip(it.title, 80);
  if (!title) throw new Error("A name is required");
  const t = now();
  const rec = {
    id: it.id && /^it_[a-z0-9]+$/i.test(it.id) ? it.id : id("it"), tenant_id: tenantId, sort: Number.isFinite(Number(it.sort)) ? Number(it.sort) : 0,
    title, subtitle: clip(it.subtitle, 120), status, price: clip(it.price, 40), photo: clip(it.photo, 400), notes: clip(it.notes, 600),
    buyer_name: clip(it.buyer_name, 120), buyer_phone: clip(it.buyer_phone, 40), deposit: clip(it.deposit, 60), go_home: clip(it.go_home, 60), private_notes: clip(it.private_notes, 1000),
  };
  await env.DB.prepare(`INSERT INTO site_items (id, tenant_id, sort, title, subtitle, status, price, photo, notes, buyer_name, buyer_phone, deposit, go_home, private_notes, created_at, updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)
    ON CONFLICT(id) DO UPDATE SET sort=?3, title=?4, subtitle=?5, status=?6, price=?7, photo=?8, notes=?9, buyer_name=?10, buyer_phone=?11, deposit=?12, go_home=?13, private_notes=?14, updated_at=?15
    WHERE tenant_id = ?2`)
    .bind(rec.id, tenantId, rec.sort, rec.title, rec.subtitle, rec.status, rec.price, rec.photo, rec.notes, rec.buyer_name, rec.buyer_phone, rec.deposit, rec.go_home, rec.private_notes, t).run();
  return rec;
}

export async function deleteItem(env, tenantId, itemId) {
  await ensureTrackerSchema(env);
  await env.DB.prepare("DELETE FROM site_items WHERE id = ? AND tenant_id = ?").bind(itemId, tenantId).run();
}

// ---------- leads ----------
export async function listLeads(env, tenantId, limit = 200) {
  if (!hasDB(env)) return [];
  await ensureTrackerSchema(env);
  const { results } = await env.DB.prepare("SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").bind(tenantId, limit).all();
  return (results || []).map((r) => ({ ...r, details: safeJSON(r.details_json, null), details_json: undefined, status: r.status || "new" }));
}

export async function updateLead(env, tenantId, leadId, { status, notes, item_id }) {
  await ensureTrackerSchema(env);
  const st = LEAD_STATUSES.includes(status) ? status : null;
  await env.DB.prepare("UPDATE leads SET status = COALESCE(?1, status), notes = COALESCE(?2, notes), item_id = COALESCE(?3, item_id), updated_at = ?4 WHERE id = ?5 AND tenant_id = ?6")
    .bind(st, notes == null ? null : String(notes).slice(0, 2000), item_id || null, now(), leadId, tenantId).run();
}

export async function setLeadDetails(env, leadId, details) {
  await ensureTrackerSchema(env);
  await env.DB.prepare("UPDATE leads SET details_json = ?, status = 'new', updated_at = ? WHERE id = ?").bind(JSON.stringify(details), now(), leadId).run();
}

// ---------- manage links ----------
function token() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createManageLink(env, tenantId, label = null) {
  await ensureTrackerSchema(env);
  const t = token();
  await env.DB.prepare("INSERT INTO manage_links (token, tenant_id, label, created_at) VALUES (?,?,?,?)").bind(t, tenantId, label, now()).run();
  return t;
}

export async function tenantForManageToken(env, t) {
  if (!hasDB(env) || !t || t.length < 16) return null;
  await ensureTrackerSchema(env);
  const row = await env.DB.prepare("SELECT tenant_id FROM manage_links WHERE token = ? AND revoked = 0").bind(t).first();
  return row?.tenant_id || null;
}
