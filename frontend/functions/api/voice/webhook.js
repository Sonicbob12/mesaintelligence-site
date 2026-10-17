// POST /api/voice/webhook — Retell call events (call_ended, call_analyzed).
// Stores the transcript as a conversation (channel "voice"), files a lead when the
// analysis says a human should follow up, and notifies the business.

import { verifyRetell } from "../../_lib/retell.js";
import { insertLead, saveConversation, loadConversation, now } from "../../_lib/db.js";
import { runWorkflow } from "../../_lib/workflow.js";
import { json } from "../../_lib/http.js";
import { tenantForCall } from "./tool.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const raw = await request.text();
  if (!(await verifyRetell(env, raw, request.headers.get("x-retell-signature")))) return json({ detail: "Unauthorized" }, 401);
  let body; try { body = JSON.parse(raw); } catch { return json({ ok: true }); }
  const { event, call } = body || {};
  if (!call?.call_id || !["call_ended", "call_analyzed"].includes(event)) return json({ ok: true });

  const tenant = await tenantForCall(env, call);
  if (!tenant) return json({ ok: true });

  // Transcript → conversation messages (plain text turns).
  const messages = [];
  for (const t of call.transcript_object || []) {
    if (t.role === "user" && t.content) messages.push({ role: "user", content: t.content });
    else if (t.role === "agent" && t.content) messages.push({ role: "assistant", content: [{ type: "text", text: t.content }] });
  }
  if (!messages.length && call.transcript) messages.push({ role: "user", content: call.transcript.slice(0, 8000) });

  const existing = await loadConversation(env, call.call_id);
  const analysis = call.call_analysis || null;
  await saveConversation(env, {
    id: call.call_id, tenant_id: tenant.id, channel: "voice", external_id: call.from_number || null,
    messages, turns: Math.max(existing?.turns || 0, messages.filter((m) => m.role === "user").length),
    created_at: existing?.created_at || (call.start_timestamp ? Math.floor(call.start_timestamp / 1000) : now()),
    summary: analysis?.call_summary || existing?.summary || null,
  });

  if (event === "call_analyzed" && analysis) {
    const custom = analysis.custom_analysis_data || {};
    const needsFollowup = custom.needs_followup === true || analysis.call_successful === false;
    const mins = call.start_timestamp && call.end_timestamp ? Math.round((call.end_timestamp - call.start_timestamp) / 60000) : null;
    let rec = null;
    if (needsFollowup) {
      rec = await insertLead(env, {
        tenant_id: tenant.id, conversation_id: call.call_id, source: "voice",
        name: custom.caller_name || null, phone: custom.callback_phone || call.from_number || null,
        summary: analysis.call_summary || "Call needs follow-up",
      });
    }
    const job = runWorkflow(env, tenant, call.call_id, {
      kind: "call", rec, summary: analysis.call_summary || "", from: call.from_number || null, needsFollowup, mins,
      sentiment: analysis.user_sentiment || null, callerName: custom.caller_name || null, callbackPhone: custom.callback_phone || null,
    }).catch((e) => console.error("call workflow", e?.message || e));
    if (typeof waitUntil === "function") waitUntil(job); else await job;
  }
  return json({ ok: true });
}
