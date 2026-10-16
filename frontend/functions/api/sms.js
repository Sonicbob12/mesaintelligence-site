// POST /api/sms — Twilio inbound SMS webhook. Same agent engine, SMS channel.
//
// Setup: in Twilio, point the number's "A message comes in" webhook at
// https://mesaintelligence.ai/api/sms (HTTP POST). Set TWILIO_AUTH_TOKEN as a
// secret so requests are verified. The tenant is chosen by the number texted
// (tenants.sms_number must equal the Twilio number in E.164, e.g. +15755550123).

import { tenantBySmsNumber } from "../_lib/tenants.js";
import { conversationForExternal } from "../_lib/db.js";
import { agentTurn, newConversation } from "../_lib/agent.js";
import { clientIp } from "../_lib/http.js";

export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null);
  if (!form) return twiml("");
  const params = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  if (env.TWILIO_AUTH_TOKEN) {
    const ok = await verifyTwilio(env.TWILIO_AUTH_TOKEN, request.url, params, request.headers.get("x-twilio-signature") || "");
    if (!ok) return new Response("Forbidden", { status: 403 });
  }

  const from = params.From, to = params.To, body = (params.Body || "").trim();
  if (!from || !to || !body) return twiml("");

  const tenant = await tenantBySmsNumber(env, to);
  if (!tenant) return twiml("This number isn't set up yet.");

  let conversation = await conversationForExternal(env, tenant.id, "sms", from);
  if (!conversation) conversation = newConversation(tenant, "sms", from);

  let text = "";
  for await (const evt of agentTurn({ env, tenant, conversation, message: body, channel: "sms", ip: clientIp(request) })) {
    if (evt.type === "delta") text += evt.text;
    else if (evt.type === "notice") text += evt.text;
    else if (evt.type === "error") text = text || "Sorry — something went wrong on our side. Please call us directly.";
  }
  return twiml(text.trim().slice(0, 1500) || "Sorry, I didn't catch that. Could you say it another way?");
}

function twiml(message) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const xml = message ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(message)}</Message></Response>`
                      : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(xml, { headers: { "content-type": "text/xml" } });
}

// https://www.twilio.com/docs/usage/webhooks/webhooks-security
async function verifyTwilio(authToken, url, params, signature) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64 === signature;
}
