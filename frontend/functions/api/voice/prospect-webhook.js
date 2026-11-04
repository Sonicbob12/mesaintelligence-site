// POST /api/voice/prospect-webhook — Retell events for the shared prospect demo agent (_lib/prospect_demo.js).
// Saves the transcript and, on call_analyzed, emails Bobby that a prospect just tried their line.

import { verifyRetell } from "../../_lib/retell.js";
import { recordDemoCall } from "../../_lib/prospect_demo.js";
import { json } from "../../_lib/http.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const raw = await request.text();
  if (!(await verifyRetell(env, raw, request.headers.get("x-retell-signature")))) return json({ detail: "Unauthorized" }, 401);
  let body; try { body = JSON.parse(raw); } catch { return json({ ok: true }); }
  const { event, call } = body || {};
  if (!call?.call_id || !["call_ended", "call_analyzed"].includes(event)) return json({ ok: true });
  const job = recordDemoCall(env, call, event).catch((e) => console.error("prospect webhook", e?.message || e));
  if (typeof waitUntil === "function") waitUntil(job); else await job;
  return json({ ok: true });
}
