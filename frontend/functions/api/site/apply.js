// POST /api/site/apply — application / enquiry form on a client website.
// Body: { tenant, name, email, phone, city, item, message, answers:{…}, sms_consent, website (honeypot) }
// Saves a lead (source "application", full answers in details_json) and runs the tenant's lead workflow
// (owner email; text acknowledgement only when the tenant has texting on and the person ticked consent).

import { loadTenant } from "../../_lib/tenants.js";
import { insertLead, hit } from "../../_lib/db.js";
import { setLeadDetails } from "../../_lib/tracker.js";
import { runWorkflow } from "../../_lib/workflow.js";
import { json, readJSON, clientIp } from "../../_lib/http.js";

const CORS = { "access-control-allow-origin": "*" };
const s = (v, n) => String(v ?? "").trim().slice(0, n);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" } });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const b = await readJSON(request);
  if (!b) return json({ detail: "Bad JSON" }, 400, CORS);
  if (b.website) return json({ ok: true }, 200, CORS); // honeypot
  const tenant = await loadTenant(env, b.tenant);
  if (!tenant || tenant.demo) return json({ detail: "Unknown business" }, 404, CORS);

  const name = s(b.name, 120), email = s(b.email, 200), phone = s(b.phone, 40), city = s(b.city, 120);
  const item = s(b.item, 120), message = s(b.message, 3000);
  if (!name) return json({ detail: "Please enter your name" }, 400, CORS);
  if (!email && phone.replace(/\D/g, "").length < 10) return json({ detail: "Please enter a phone number or email so we can reach you" }, 400, CORS);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ detail: "That email doesn't look right" }, 400, CORS);

  const ip = clientIp(request);
  const rl = await hit(env, `apply:${tenant.id}:${ip}`, 3600, 5);
  if (!rl.allowed) return json({ detail: "Thanks — we already have your application. We'll be in touch." }, 429, CORS);

  const answers = {};
  for (const [k, v] of Object.entries(b.answers && typeof b.answers === "object" ? b.answers : {}).slice(0, 20)) answers[s(k, 60)] = s(v, 600);
  const lines = [item ? `Interested in: ${item}` : null, city ? `From: ${city}` : null, ...Object.entries(answers).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), message ? `Message: ${message}` : null].filter(Boolean);

  const rec = await insertLead(env, { tenant_id: tenant.id, source: "application", name, phone: phone || null, email: email || null, summary: lines.join("\n").slice(0, 1000) || "Website application" });
  await setLeadDetails(env, rec.id, { item, city, message, answers, sms_consent: b.sms_consent === true, at: new Date().toISOString(), ip });

  const notes = b.sms_consent === true ? "" : "no SMS";
  const job = runWorkflow(env, tenant, null, { kind: "lead", rec: { ...rec, notes } }).catch((e) => console.error("apply workflow", e?.message || e));
  if (waitUntil) waitUntil(job); else await job;
  return json({ ok: true }, 200, CORS);
}
