// Emails for the Local Discovery audit: the report to the business owner, and a lead alert to Mesa.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const F = "font-family:Helvetica,Arial,sans-serif";

async function send(env, msg) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", ...msg }),
    });
    if (!res.ok) console.error("audit email: Resend", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) { console.error("audit email", e?.message || e); return false; }
}

export async function emailReport(env, { to, name, business, data, plan }) {
  const c = data.competitors || {};
  const fixes = (plan?.fixes || []).map((f, i) => `
    <tr><td style="${F};padding:10px 0;border-top:1px solid #eee;vertical-align:top;width:28px;color:#D96B43;font-weight:bold">${i + 1}</td>
    <td style="${F};padding:10px 0;border-top:1px solid #eee">
      <div style="font-weight:bold">${esc(f.title)} <span style="font-weight:normal;color:#888;font-size:12px">· ${esc(f.impact)} impact${f.effort ? ` · ${esc(f.effort)}` : ""}</span></div>
      <div style="color:#444;margin-top:4px">${esc(f.why)}</div>
      <div style="color:#222;margin-top:4px">${esc(f.how)}</div>
    </td></tr>`).join("");
  const misses = (data.issues || []).map((x) => `<li style="margin:4px 0">${esc(x.label)}${x.status === "warn" ? " (needs work)" : ""}</li>`).join("");
  const first = esc(String(name || "").split(" ")[0] || "there");

  const html = `<div style="${F};max-width:620px;color:#111;line-height:1.5">
    <p>Hi ${first},</p>
    <p>Here's the local discovery audit for <b>${esc(business || "your business")}</b>.</p>
    <table style="${F};border-collapse:collapse;margin:16px 0"><tr>
      <td style="padding:12px 18px;background:#0B0C0E;color:#fff;text-align:center"><div style="font-size:34px;font-weight:bold">${data.score}</div><div style="font-size:11px;letter-spacing:2px">OVERALL · ${esc(data.grade)}</div></td>
      <td style="padding:12px 18px;border:1px solid #eee;text-align:center"><div style="font-size:24px">${data.listingScore}</div><div style="font-size:11px;color:#666">GOOGLE LISTING</div></td>
      <td style="padding:12px 18px;border:1px solid #eee;text-align:center"><div style="font-size:24px">${data.hasWebsite ? data.websiteScore : "—"}</div><div style="font-size:11px;color:#666">WEBSITE</div></td>
    </tr></table>
    ${c.count > 1 ? `<p>Among ${c.count} similar businesses nearby, you rank <b>#${c.rankByReviews}</b> by number of reviews and <b>#${c.rankByRating}</b> by rating${c.reviewsToMedian ? ` — about <b>${c.reviewsToMedian}</b> more reviews would put you at the local median` : ""}.</p>` : ""}
    ${plan?.headline ? `<p style="font-size:16px"><b>${esc(plan.headline)}</b></p>` : ""}
    <h3 style="${F};margin:24px 0 4px">Your fix-it plan</h3>
    <table style="${F};border-collapse:collapse;width:100%">${fixes}</table>
    ${misses ? `<h3 style="${F};margin:24px 0 4px">Everything the audit flagged</h3><ul style="padding-left:18px;color:#333">${misses}</ul>` : ""}
    <p style="margin-top:24px">Want help with any of this? Just reply to this email, or book a free walkthrough at <a href="https://mesaintelligence.ai/#contact">mesaintelligence.ai</a>. Most of these fixes you can do yourself — we're happy to point you in the right direction either way.</p>
    <p>— Bobby<br>Mesa Intelligence · Las Cruces, NM</p>
    <p style="color:#999;font-size:11px;margin-top:24px">Listing data from Google Maps. Scores are Mesa Intelligence's own assessment and aren't endorsed by Google.</p>
  </div>`;

  const text = [
    `Hi ${String(name || "").split(" ")[0] || "there"},`, "",
    `Local discovery audit for ${business || "your business"}: overall ${data.score} (${data.grade}), Google listing ${data.listingScore}, website ${data.hasWebsite ? data.websiteScore : "none"}.`,
    c.count > 1 ? `Rank among ${c.count} nearby: #${c.rankByReviews} by reviews, #${c.rankByRating} by rating.` : "", "",
    plan?.headline || "", "", "Fix-it plan:",
    ...(plan?.fixes || []).map((f, i) => `${i + 1}. ${f.title} (${f.impact} impact) — ${f.why} ${f.how}`), "",
    "Reply to this email or visit https://mesaintelligence.ai/#contact for help.", "— Bobby, Mesa Intelligence", "", "Listing data from Google Maps.",
  ].join("\n");

  return send(env, { to: [to], reply_to: env.LEAD_TO || undefined, subject: `Your local discovery audit: ${data.score}/100 for ${business || "your business"}`, html, text });
}

export async function emailLeadAlert(env, { audit, contact, data }) {
  if (!env.LEAD_TO) return false;
  const rows = [["Name", contact.name], ["Email", contact.email], ["Phone", contact.phone || "—"], ["Business", contact.business || "—"], ["Searched", audit.query || "—"],
    ["Score", `${data.score} (${data.grade}) · listing ${data.listingScore} · website ${data.hasWebsite ? data.websiteScore : "none"}`],
    ["Top issues", (data.issues || []).slice(0, 4).map((x) => x.label).join("; ")], ["Audit id", audit.id]];
  const html = `<h3 style="${F}">New audit lead from mesaintelligence.ai</h3><table style="${F};border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table><p style="${F}">Full audit: https://mesaintelligence.ai/admin (Local Discovery)</p>`;
  return send(env, { to: [env.LEAD_TO], reply_to: contact.email, subject: `Audit lead: ${contact.business || audit.query || "local business"} — ${data.score}/100`, html, text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") });
}
