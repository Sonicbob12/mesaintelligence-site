// Knowledge retrieval: full-text search over a tenant's docs.
// D1 path uses an FTS5 table (knowledge_fts) with BM25 ranking; the fallback
// (no D1, or a demo tenant with no rows) scores the built-in docs by term overlap.

import { hasDB } from "./db.js";
import { demoKnowledge } from "./tenants.js";

const STOP = new Set(("a an the and or but if of to in on at for with by from as is are was were be been it its this that these those " +
  "i me my we our you your he she they them his her their what which who whom when where why how do does did can could would should " +
  "will just not no yes so than then too very s t have has had about into over out up down off").split(" "));

export function terms(text) {
  return [...new Set(String(text || "").toLowerCase().replace(/[^a-z0-9$%'\s-]/g, " ").split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w)))];
}

export async function retrieve(env, tenantId, query, limit = 4) {
  const ts = terms(query);
  if (!ts.length) return [];

  if (hasDB(env)) {
    try {
      // Quote each term so punctuation can't break the FTS5 query; OR them for recall, BM25 sorts for precision.
      const match = ts.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
      const { results } = await env.DB.prepare(
        `SELECT k.id, k.title, k.content, bm25(knowledge_fts) AS score
           FROM knowledge_fts
           JOIN knowledge k ON k.rowid = knowledge_fts.rowid
          WHERE knowledge_fts MATCH ?1 AND k.tenant_id = ?2
          ORDER BY score LIMIT ?3`
      ).bind(match, tenantId, limit).all();
      if (results && results.length) return results.map(({ id, title, content }) => ({ id, title, content }));
      // A real tenant with docs but no hits, or a demo tenant with no rows: fall through to built-ins.
      const { results: any } = await env.DB.prepare("SELECT 1 FROM knowledge WHERE tenant_id = ? LIMIT 1").bind(tenantId).all();
      if (any && any.length) return [];
    } catch (e) {
      console.error("retrieval error", e?.message || e);
    }
  }

  const docs = demoKnowledge(tenantId);
  return docs
    .map((d) => {
      const hay = `${d.title} ${d.content}`.toLowerCase();
      let score = 0;
      for (const t of ts) if (hay.includes(t)) score += t.length > 5 ? 2 : 1;
      return { ...d, score };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, content }) => ({ title, content }));
}
