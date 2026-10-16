// Thin D1 helpers with an in-memory fallback so the site keeps working
// before the D1 binding ("DB") is attached in Cloudflare Pages settings.
//
// Everything that touches storage goes through here so the fallback is
// consistent: conversations, rate limits, bookings, leads, handoffs.

const mem = {
  conversations: new Map(),
  rate: new Map(),
  bookings: [],
  leads: [],
  handoffs: [],
};

export function hasDB(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === "function");
}

export const now = () => Math.floor(Date.now() / 1000);

export function id(prefix = "") {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return prefix ? `${prefix}_${raw}` : raw;
}

// ---------- conversations ----------
export async function loadConversation(env, convId) {
  if (!convId) return null;
  if (!hasDB(env)) return mem.conversations.get(convId) || null;
  const row = await env.DB.prepare("SELECT * FROM conversations WHERE id = ?").bind(convId).first();
  if (!row) return null;
  return { ...row, messages: safeJSON(row.messages_json, []) };
}

export async function saveConversation(env, conv) {
  const rec = { ...conv, updated_at: now(), created_at: conv.created_at || now() };
  if (!hasDB(env)) { mem.conversations.set(rec.id, rec); return rec; }
  await env.DB.prepare(
    `INSERT INTO conversations (id, tenant_id, channel, external_id, messages_json, turns, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET messages_json = ?5, turns = ?6, updated_at = ?8`
  ).bind(rec.id, rec.tenant_id, rec.channel, rec.external_id || null,
         JSON.stringify(rec.messages), rec.turns || 0, rec.created_at, rec.updated_at).run();
  return rec;
}

// Find (or create) the conversation for an external channel identity, e.g. an SMS number.
export async function conversationForExternal(env, tenantId, channel, externalId) {
  if (!hasDB(env)) {
    for (const c of mem.conversations.values()) {
      if (c.tenant_id === tenantId && c.channel === channel && c.external_id === externalId) return c;
    }
    return null;
  }
  const row = await env.DB.prepare(
    "SELECT * FROM conversations WHERE tenant_id = ? AND channel = ? AND external_id = ? ORDER BY updated_at DESC LIMIT 1"
  ).bind(tenantId, channel, externalId).first();
  return row ? { ...row, messages: safeJSON(row.messages_json, []) } : null;
}

// ---------- rate limiting (fixed window) ----------
export async function hit(env, key, windowSec, limit) {
  const t = now();
  const windowStart = t - (t % windowSec);
  if (!hasDB(env)) {
    const cur = mem.rate.get(key);
    if (!cur || cur.windowStart !== windowStart) { mem.rate.set(key, { windowStart, count: 1 }); return { allowed: true, count: 1 }; }
    cur.count += 1;
    return { allowed: cur.count <= limit, count: cur.count };
  }
  await env.DB.prepare(
    `INSERT INTO rate_limits (k, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(k) DO UPDATE SET
       count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END,
       window_start = ?2`
  ).bind(key, windowStart).run();
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE k = ?").bind(key).first();
  const count = row ? row.count : 1;
  return { allowed: count <= limit, count };
}

// ---------- bookings / leads / handoffs ----------
export async function insertBooking(env, b) {
  const rec = { id: id("bk"), created_at: now(), status: "confirmed", ...b };
  if (!hasDB(env)) { mem.bookings.push(rec); return rec; }
  await env.DB.prepare(
    `INSERT INTO bookings (id, tenant_id, conversation_id, customer_name, phone, email, service, start_at, end_at, notes, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(rec.id, rec.tenant_id, rec.conversation_id || null, rec.customer_name, rec.phone || null, rec.email || null,
         rec.service || null, rec.start_at, rec.end_at, rec.notes || null, rec.status, rec.created_at).run();
  return rec;
}

export async function bookingsBetween(env, tenantId, fromAt, toAt) {
  if (!hasDB(env)) {
    return mem.bookings.filter((b) => b.tenant_id === tenantId && b.status !== "cancelled" && b.start_at < toAt && b.end_at > fromAt);
  }
  const { results } = await env.DB.prepare(
    "SELECT * FROM bookings WHERE tenant_id = ? AND status != 'cancelled' AND start_at < ? AND end_at > ?"
  ).bind(tenantId, toAt, fromAt).all();
  return results || [];
}

export async function insertLead(env, l) {
  const rec = { id: id("ld"), created_at: now(), ...l };
  if (!hasDB(env)) { mem.leads.push(rec); return rec; }
  await env.DB.prepare(
    `INSERT INTO leads (id, tenant_id, conversation_id, name, phone, email, summary, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(rec.id, rec.tenant_id, rec.conversation_id || null, rec.name || null, rec.phone || null, rec.email || null,
         rec.summary || null, rec.source || "chat", rec.created_at).run();
  return rec;
}

export async function insertHandoff(env, h) {
  const rec = { id: id("ho"), created_at: now(), status: "open", ...h };
  if (!hasDB(env)) { mem.handoffs.push(rec); return rec; }
  await env.DB.prepare(
    `INSERT INTO handoffs (id, tenant_id, conversation_id, reason, urgency, callback_phone, status, created_at) VALUES (?,?,?,?,?,?,?,?)`
  ).bind(rec.id, rec.tenant_id, rec.conversation_id || null, rec.reason || null, rec.urgency || "normal",
         rec.callback_phone || null, rec.status, rec.created_at).run();
  return rec;
}

// ---------- admin reads ----------
export async function recentActivity(env, tenantId, limit = 50) {
  if (!hasDB(env)) {
    const f = (arr) => arr.filter((r) => !tenantId || r.tenant_id === tenantId).slice(-limit).reverse();
    return { bookings: f(mem.bookings), leads: f(mem.leads), handoffs: f(mem.handoffs),
             conversations: f([...mem.conversations.values()]).map(stripMessages) };
  }
  const where = tenantId ? "WHERE tenant_id = ?" : "";
  const q = (sql) => (tenantId ? env.DB.prepare(sql).bind(tenantId, limit) : env.DB.prepare(sql).bind(limit)).all().then((r) => r.results || []);
  const [bookings, leads, handoffs, conversations] = await Promise.all([
    q(`SELECT * FROM bookings ${where} ORDER BY created_at DESC LIMIT ?`),
    q(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT ?`),
    q(`SELECT * FROM handoffs ${where} ORDER BY created_at DESC LIMIT ?`),
    q(`SELECT id, tenant_id, channel, external_id, turns, created_at, updated_at FROM conversations ${where} ORDER BY updated_at DESC LIMIT ?`),
  ]);
  return { bookings, leads, handoffs, conversations };
}

function stripMessages(c) { const { messages, messages_json, ...rest } = c; return rest; }

export function safeJSON(s, fallback) {
  try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; }
}
