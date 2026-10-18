// POST /api/audit/report { audit_id, name, email, phone?, business? }
// → the AI fix-it plan; emails the report to the owner and a lead alert to Mesa.
// In AUDIT_PRO_MODE=free (founding period) the email also unlocks the full Pro report.
import { loadAudit, actionPlan, attachContact, proMode, proPrice } from "../../_lib/audit.js";
import { unlockPro, reportLink } from "../../_lib/audit_pro.js";
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

  const contact = { name, email, phone, business };
  const mode = proMode(env);
  const link = reportLink(env, audit.id, audit.share_key);

  // Founding period: the email is the price. Run the Pro extras now (~10 s) and send the Pro report.
  if (mode === "free") {
    await attachContact(env, audit.id, contact, null);
    try {
      const done = await unlockPro(env, audit.id, { waitUntil, email: true });
      const alert = emailLeadAlert(env, { audit, contact, data: done.data, pro: true }).catch((e) => console.error("lead alert", e?.message || e));
      if (typeof waitUntil === "function") waitUntil(alert); else await alert;
      return json({ ok: true, plan: done.plan, full: done.full, pro: true, link, emailed: Boolean(env.RESEND_API_KEY) });
    } catch (e) { console.error("free pro unlock", e?.message || e); /* fall through to the basic plan */ }
  }

  // Basic plan (Pro off, or paid mode before purchase). The plan usually finished in the background.
  let plan = audit.plan;
  for (let i = 0; !plan && i < 6; i++) { await new Promise((r) => setTimeout(r, 1500)); plan = (await loadAudit(env, audit.id))?.plan; }
  const fresh = !plan;
  if (!plan) plan = await actionPlan(env, audit.data.facts || {});
  await attachContact(env, audit.id, contact, fresh ? plan : null);
  const mails = Promise.all([
    emailReport(env, { to: email, name, business, data: audit.data, plan, link, proOffer: mode === "paid" ? { price: proPrice(env) } : null }),
    emailLeadAlert(env, { audit, contact, data: audit.data }),
  ]).catch((e) => console.error("audit mails", e?.message || e));
  if (typeof waitUntil === "function") waitUntil(mails); else await mails;
  return json({ ok: true, plan, pro: false, link, pro_mode: mode, pro_price: proPrice(env), emailed: Boolean(env.RESEND_API_KEY) });
}
