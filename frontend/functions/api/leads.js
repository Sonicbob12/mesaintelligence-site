// POST /api/leads — emails each contact-form enquiry via Resend.
// Env vars (Cloudflare Pages → Settings → Variables and Secrets):
//   RESEND_API_KEY  (secret)
//   LEAD_TO         e.g. hello@mesaintelligence.ai
//   LEAD_FROM       e.g. "Mesa Intelligence <onboarding@resend.dev>" until the domain is verified in Resend,
//                   then "Mesa Intelligence <hello@mesaintelligence.ai>"

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function onRequestPost({ request, env }) {
  let lead;
  try { lead = await request.json(); } catch { return json({ detail: "Bad JSON" }, 400); }

  const name = String(lead.name || "").trim().slice(0, 120);
  const email = String(lead.email || "").trim().slice(0, 200);
  const phone = String(lead.phone || "").trim().slice(0, 40);
  const company = String(lead.company || "").trim().slice(0, 120);
  const industry = String(lead.industry || "").trim().slice(0, 60);
  const message = String(lead.message || "").trim().slice(0, 4000);
  const website = String(lead.website || "").trim(); // honeypot; real users never fill it
  const source = lead.source === "sms_optin" ? "sms_optin" : "contact_form";
  const smsConsent = lead.sms_consent === true;
  const consentText = String(lead.sms_consent_text || "").trim().slice(0, 600);
  const digits = phone.replace(/\D/g, "");

  if (website) return json({ ok: true }); // silently drop bots
  if (smsConsent && (digits.length < 10 || digits.length > 11)) return json({ detail: "Enter a valid mobile number to receive texts" }, 400);
  if (source === "sms_optin") {
    // /sms opt-in form: name + mobile + an explicit checked box are required; email optional.
    if (!name || !smsConsent || !consentText) return json({ detail: "Name, mobile number and the consent checkbox are required" }, 400);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ detail: "Invalid email" }, 400);
  } else {
    if (!name || !email || !company || !industry || !message) return json({ detail: "Missing fields" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ detail: "Invalid email" }, 400);
  }
  if (!env.RESEND_API_KEY || !env.LEAD_TO) return json({ detail: "Lead delivery not configured" }, 503);

  const at = new Date().toISOString();
  const ip = request.headers.get("cf-connecting-ip") || "";
  const ua = (request.headers.get("user-agent") || "").slice(0, 200);
  // Consent record kept in the lead email (the audit trail carriers ask for): what was agreed to, when, from where.
  const consentRow = smsConsent
    ? `YES — ${at} · IP ${ip || "?"} · ${source === "sms_optin" ? "mesaintelligence.ai/sms opt-in form" : "mesaintelligence.ai contact form"}<br><span style="color:#666">“${esc(consentText)}”</span>`
    : "No";
  const subject = source === "sms_optin"
    ? `SMS opt-in: ${name} (${phone})`
    : `New enquiry: ${company} (${industry})${smsConsent ? " · SMS opt-in" : ""}`;
  const html = `
    <h2 style="font-family:sans-serif">${source === "sms_optin" ? "New SMS opt-in" : "New enquiry"} from mesaintelligence.ai</h2>
    <table style="font-family:sans-serif;border-collapse:collapse">
      <tr><td style="padding:4px 12px 4px 0"><b>Name</b></td><td>${esc(name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>Email</b></td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>Phone</b></td><td>${esc(phone) || "—"}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>Business</b></td><td>${esc(company)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>Industry</b></td><td>${esc(industry) || "—"}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;vertical-align:top"><b>SMS consent</b></td><td>${consentRow}</td></tr>
    </table>
    <p style="font-family:sans-serif;color:#888;font-size:12px">User agent: ${esc(ua)}</p>
    ${message ? `<h3 style="font-family:sans-serif">Message</h3>
    <p style="font-family:sans-serif;white-space:pre-wrap">${esc(message)}</p>` : ""}
    <p style="font-family:sans-serif;color:#888;font-size:12px">Received ${new Date().toUTCString()}</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: env.LEAD_FROM || "Mesa Intelligence <onboarding@resend.dev>",
      to: [env.LEAD_TO],
      ...(email ? { reply_to: email } : {}),
      subject,
      html,
      text: `Name: ${name}\nEmail: ${email || "-"}\nPhone: ${phone || "-"}\nBusiness: ${company || "-"}\nIndustry: ${industry || "-"}\nSMS consent: ${smsConsent ? `YES ${at} IP ${ip} (${source}) "${consentText}"` : "No"}\n\n${message}`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Resend error", res.status, detail);
    return json({ detail: "Could not send" }, 502);
  }
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
