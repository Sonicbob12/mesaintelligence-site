// Generates schema.sql (DDL + demo seed) from the demo tenant/knowledge code so they never drift.
// Run: node scripts/gen-schema.mjs > schema.sql
import { DEMO_TENANTS, tenantToRow } from "../functions/_lib/tenants.js";
import { DEMO_KNOWLEDGE } from "../functions/_lib/demo_knowledge.js";

const q = (v) => v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

const ddl = `CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vertical TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Denver',
  greeting TEXT NOT NULL DEFAULT '',
  presets_json TEXT NOT NULL DEFAULT '[]',
  persona TEXT NOT NULL,
  hours_json TEXT NOT NULL DEFAULT '{}',
  slot_minutes INTEGER NOT NULL DEFAULT 60,
  services_json TEXT NOT NULL DEFAULT '[]',
  escalation TEXT NOT NULL DEFAULT '',
  notify_email TEXT,
  sms_number TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS tenants_sms ON tenants (sms_number);

CREATE TABLE IF NOT EXISTS knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS knowledge_tenant ON knowledge (tenant_id);

-- Full-text index over knowledge (external-content FTS5). The app keeps it in sync;
-- after bulk SQL changes run:  INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild');
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(title, content, content='knowledge', content_rowid='id', tokenize='porter unicode61');

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web',
  external_id TEXT,
  messages_json TEXT NOT NULL DEFAULT '[]',
  turns INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_ext ON conversations (tenant_id, channel, external_id);
CREATE INDEX IF NOT EXISTS conversations_updated ON conversations (updated_at);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT, email TEXT, service TEXT,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_tenant_time ON bookings (tenant_id, start_at);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  name TEXT, phone TEXT, email TEXT, summary TEXT,
  source TEXT NOT NULL DEFAULT 'chat',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  reason TEXT, urgency TEXT NOT NULL DEFAULT 'normal', callback_phone TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

-- ---------- demo seed ----------
`;

let out = ddl;
for (const t of Object.values(DEMO_TENANTS)) {
  const row = tenantToRow(t);
  out += `INSERT OR REPLACE INTO tenants (id, name, vertical, timezone, greeting, presets_json, persona, hours_json, slot_minutes, services_json, escalation, notify_email, sms_number, demo, active)\nVALUES (${row.map(q).join(", ")});\n`;
}
out += `\nDELETE FROM knowledge WHERE tenant_id IN (${Object.keys(DEMO_KNOWLEDGE).map(q).join(", ")});\n`;
for (const [tid, docs] of Object.entries(DEMO_KNOWLEDGE)) {
  for (const d of docs) out += `INSERT INTO knowledge (tenant_id, title, content, created_at) VALUES (${q(tid)}, ${q(d.title)}, ${q(d.content)}, unixepoch());\n`;
}
out += `\nINSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild');\n`;
// No comment lines: the D1 dashboard console's statement splitter is picky; explanations live in docs/agent-engine.md.
out = out.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n').replace(/\n{3,}/g, '\n\n');
process.stdout.write(out);
