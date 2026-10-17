// GET /api/workflow/runs?conversation=<id> → the post-conversation chains for a demo conversation
// (public, redacted). Real clients see theirs in /admin.
import { runsForConversation, publicRun } from "../../_lib/workflow.js";
import { loadTenant } from "../../_lib/tenants.js";
import { json } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const conv = new URL(request.url).searchParams.get("conversation") || "";
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(conv)) return json({ runs: [] });
  const runs = await runsForConversation(env, conv, 5);
  const out = [];
  for (const r of runs) {
    const t = await loadTenant(env, r.tenant_id);
    if (t?.demo) out.push(publicRun(r));
  }
  return json({ runs: out });
}
