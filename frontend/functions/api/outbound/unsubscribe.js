// GET/POST /api/outbound/unsubscribe?t=<token> — one-click unsubscribe (also honours List-Unsubscribe-Post).
import { suppress } from "../../_lib/outbound.js";
import { hasDB } from "../../_lib/db.js";

export async function onRequest({ request, env }) {
  const t = String(new URL(request.url).searchParams.get("t") || "").slice(0, 40);
  let email = null;
  if (hasDB(env) && t) {
    const row = await env.DB.prepare("SELECT email FROM outreach WHERE unsub_token = ?").bind(t).first();
    email = row?.email || null;
    if (email) await suppress(env, email, "unsubscribe link");
  }
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribed</title>
  <body style="font-family:Helvetica,Arial,sans-serif;background:#0B0C0E;color:#F5F3EF;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:420px;padding:32px;text-align:center"><h2 style="font-weight:300">${email ? "You're unsubscribed." : "Already done."}</h2><p style="color:#9E9AA3">You won't get any more emails from Mesa Intelligence. If this was a mistake, write hello@mesaintelligence.ai.</p></div>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
