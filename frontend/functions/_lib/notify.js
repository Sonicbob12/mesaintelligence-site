// Outbound notifications (Resend). Only fires for tenants with notify_email set;
// demo tenants log to the database and nothing else.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function notify(env, tenant, subject, rows, extraText = "") {
  if (!tenant?.notify_email || !env.RESEND_API_KEY) return false;
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("");
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + (extraText ? `\n\n${extraText}` : "");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>",
        to: [tenant.notify_email],
        subject: `[${tenant.name}] ${subject}`,
        html: `<h3 style="font-family:sans-serif">${esc(subject)}</h3><table style="font-family:sans-serif;border-collapse:collapse">${table}</table>` +
              (extraText ? `<p style="font-family:sans-serif;white-space:pre-wrap">${esc(extraText)}</p>` : ""),
        text,
      }),
    });
    if (!res.ok) console.error("notify: Resend", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("notify error", e?.message || e);
    return false;
  }
}
