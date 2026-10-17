// POST /api/audit/report { audit_id, name, email, phone?, business? }
// → the AI fix-it plan; emails the full report to the owner and a lead alert to Mesa.
import { loadAudit, actionPlan, attachContact } from "../../_lib/audit.js";
import { emailReport, emailLeadAlert } from "../../_lib/audit_email.js";
import { hit } from "../../_lib/db.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const b = await readJSON(request);
  if (b?.website) return json({ ok: true, plan: null }); // honeypot
  const name = String(b?.name || "").trim().slice(0, 120);
  const email = String(b?.email || "").trim().slice(0, 200);
  const phone = String(b?.phone || "").trim().slice(0, 40);
  const business = String(b?.business || "").trim().slice(0, 120);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ detail: "Add your name and a valid email." }, 400);

  const ip = clientIp(request);
  const perIp = await hit(env, `audit-report:${ip}`, 86400, Number(env.AUDIT_REPORT_LIMIT_PER_DAY || 5));
  if (!perIp.allowed) return json({ detail: "Too many reports today — reply to any report email and we'll help." }, 429);

  const audit = await loadAudit(env, String(b?.audit_id || ""));
  if (!audit) return json({ detail: "That audit expired — run it again." }, 404);

  // The plan usually finished in the background while they looked at their score.
  let plan = audit.plan;
  for (let i = 0; !plan && i < 6; i++) { await new Promise((r) => setTimeout(r, 1500)); plan = (await loadAudit(env, audit.id))?.plan; }
  const fresh = !plan;
  if (!plan) plan = await actionPlan(env, audit.data.facts || {});

  const contact = { name, email, phone, business };
  await attachContact(env, audit.id, contact, fresh ? plan : null);
  const mails = Promise.all([
    emailReport(env, { to: email, name, business, data: audit.data, plan }),
    emailLeadAlert(env, { audit, contact, data: audit.data }),
  ]).catch((e) => console.error("audit mails", e?.message || e));
  if (typeof waitUntil === "function") waitUntil(mails); else await mails;
  return json({ ok: true, plan, emailed: Boolean(env.RESEND_API_KEY) });
}
