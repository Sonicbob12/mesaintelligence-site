// Emails for the Local Discovery audit: the report to the business owner (basic or Pro), and a lead alert to Mesa.

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

const tile = (n, label, dark) => `<td style="padding:12px 16px;${dark ? "background:#0B0C0E;color:#fff" : "border:1px solid #eee"};text-align:center"><div style="font-size:${dark ? 34 : 24}px;font-weight:${dark ? "bold" : "normal"}">${n}</div><div style="font-size:11px;${dark ? "letter-spacing:2px" : "color:#666"}">${label}</div></td>`;

export async function emailReport(env, { to, name, business, data, plan, link, pro = false, proOffer = null }) {
  const c = data.competitors || {};
  const fixes = (plan?.fixes || []).map((f, i) => `
    <tr><td style="${F};padding:10px 0;border-top:1px solid #eee;vertical-align:top;width:28px;color:#D96B43;font-weight:bold">${i + 1}</td>
    <td style="${F};padding:10px 0;border-top:1px solid #eee">
      <div style="font-weight:bold">${esc(f.title)} <span style="font-weight:normal;color:#888;font-size:12px">· ${esc(f.impact)} impact${f.effort ? ` · ${esc(f.effort)}` : ""}</span></div>
      <div style="color:#444;margin-top:4px">${esc(f.why)}</div>
      <div style="color:#222;margin-top:4px">${esc(f.how)}</div>
    </td></tr>`).join("");
  const misses = (data.issues || []).map((x) => `<li style="margin:4px 0">${esc(x.label)}${x.status === "warn" ? " (needs work)" : ""}</li>`).join("");
  const ranks = (data.ranks || []).map((r) => `<li style="margin:4px 0"><b>${r.position ? `#${r.position}` : "Not in the top 20"}</b> for “${esc(r.label)}”</li>`).join("");
  const first = esc(String(name || "").split(" ")[0] || "there");
  const t = data.themes;
  const td = data.teardown;
  const thirty = (plan?.thirtyDays || []).map((s) => `<li style="margin:4px 0">${esc(s)}</li>`).join("");

  const html = `<div style="${F};max-width:620px;color:#111;line-height:1.5">
    <p>Hi ${first},</p>
    <p>Here's the ${pro ? "<b>Pro</b> " : ""}local discovery audit for <b>${esc(business || "your business")}</b>.${link ? ` Your full report (printable) lives here: <a href="${esc(link)}">${esc(link)}</a>` : ""}</p>
    <table style="${F};border-collapse:collapse;margin:16px 0"><tr>
      ${tile(data.score, `OVERALL · ${esc(data.grade)}`, true)}
      ${tile(data.listingScore, "GOOGLE LISTING")}
      ${tile(data.hasWebsite ? data.websiteScore : "—", "WEBSITE")}
      ${data.visibilityScore != null ? tile(data.visibilityScore, "SEARCH VISIBILITY") : ""}
    </tr></table>
    ${ranks ? `<h3 style="${F};margin:20px 0 4px">Where you show up</h3><ul style="padding-left:18px;color:#333">${ranks}</ul>` : ""}
    ${c.count > 1 ? `<p>Among ${c.count} similar businesses nearby, you rank <b>#${c.rankByReviews}</b> by number of reviews and <b>#${c.rankByRating}</b> by rating${c.reviewsToMedian ? ` — about <b>${c.reviewsToMedian}</b> more reviews would put you at the local median` : ""}.</p>` : ""}
    ${data.duplicates ? `<p style="color:#B23B1A"><b>${data.duplicates} duplicate or conflicting listing${data.duplicates === 1 ? "" : "s"}</b> found with your name or phone — these split your reviews and confuse Google.</p>` : ""}
    ${td && td.theyHaveYouDont?.length ? `<h3 style="${F};margin:20px 0 4px">What the #1 competitor's website has that yours doesn't</h3><ul style="padding-left:18px;color:#333">${td.theyHaveYouDont.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${t && (t.praise?.length || t.complaints?.length) ? `<h3 style="${F};margin:20px 0 4px">What customers keep saying</h3>${t.praise?.length ? `<p><b>Praise:</b> ${esc(t.praise.join(" · "))}</p>` : ""}${t.complaints?.length ? `<p><b>Complaints:</b> ${esc(t.complaints.join(" · "))}</p>` : ""}${t.quote ? `<p style="color:#555">Worth putting on your site: “${esc(t.quote)}”</p>` : ""}` : ""}
    ${plan?.headline ? `<p style="font-size:16px;margin-top:20px"><b>${esc(plan.headline)}</b></p>` : ""}
    <h3 style="${F};margin:20px 0 4px">Your fix-it plan</h3>
    <table style="${F};border-collapse:collapse;width:100%">${fixes}</table>
    ${thirty ? `<h3 style="${F};margin:24px 0 4px">Next 30 days</h3><ol style="padding-left:18px;color:#333">${thirty}</ol>` : ""}
    ${misses ? `<h3 style="${F};margin:24px 0 4px">Everything the audit flagged</h3><ul style="padding-left:18px;color:#333">${misses}</ul>` : ""}
    ${data.pagespeed?.performance != null ? `<p style="color:#555">Google PageSpeed (mobile): performance ${data.pagespeed.performance}/100, SEO ${data.pagespeed.seo}/100, accessibility ${data.pagespeed.accessibility}/100.</p>` : pro ? `<p style="color:#777;font-size:12px">Google PageSpeed results are being added to your online report (takes a minute).</p>` : ""}
    ${proOffer ? `<div style="border:1px solid #D96B43;padding:14px 16px;margin:24px 0"><b>Want the full picture?</b> The Pro report adds your rank for two more searches people type, a duplicate-listing check, a teardown of the #1 competitor's website, what your reviews say, Google PageSpeed, and a 30-day plan — $${esc(proOffer.price)}, one time. ${link ? `<a href="${esc(link)}">Unlock it here</a>.` : ""}</div>` : ""}
    <p style="margin-top:24px">Want help with any of this? Just reply to this email, or book a free walkthrough at <a href="https://mesaintelligence.ai/#contact">mesaintelligence.ai</a>. Most of these fixes you can do yourself — we're happy to point you in the right direction either way.</p>
    <p>— Bobby<br>Mesa Intelligence · Las Cruces, NM</p>
    <p style="color:#999;font-size:11px;margin-top:24px">Listing data from Google Maps. Scores are Mesa Intelligence's own assessment and aren't endorsed by Google.</p>
  </div>`;

  const text = [
    `Hi ${String(name || "").split(" ")[0] || "there"},`, "",
    `${pro ? "Pro l" : "L"}ocal discovery audit for ${business || "your business"}: overall ${data.score} (${data.grade}), Google listing ${data.listingScore}, website ${data.hasWebsite ? data.websiteScore : "none"}${data.visibilityScore != null ? `, search visibility ${data.visibilityScore}` : ""}.`,
    link ? `Full report: ${link}` : "",
    ...(data.ranks || []).map((r) => `${r.position ? `#${r.position}` : "Not in top 20"} for "${r.label}"`),
    c.count > 1 ? `Rank among ${c.count} nearby: #${c.rankByReviews} by reviews, #${c.rankByRating} by rating.` : "", "",
    plan?.headline || "", "", "Fix-it plan:",
    ...(plan?.fixes || []).map((f, i) => `${i + 1}. ${f.title} (${f.impact} impact) — ${f.why} ${f.how}`), "",
    ...(plan?.thirtyDays?.length ? ["Next 30 days:", ...plan.thirtyDays, ""] : []),
    "Reply to this email or visit https://mesaintelligence.ai/#contact for help.", "— Bobby, Mesa Intelligence", "", "Listing data from Google Maps.",
  ].join("\n");

  return send(env, { to: [to], reply_to: env.LEAD_TO || undefined, subject: `${pro ? "Your Pro" : "Your"} local discovery audit: ${data.score}/100 for ${business || "your business"}`, html, text });
}

export async function emailLeadAlert(env, { audit, contact, data, pro = false, paid = false }) {
  if (!env.LEAD_TO) return false;
  const rows = [["Name", contact.name], ["Email", contact.email], ["Phone", contact.phone || "—"], ["Business", contact.business || "—"], ["Searched", audit.query || "—"],
    ["Score", `${data.score} (${data.grade}) · listing ${data.listingScore} · website ${data.hasWebsite ? data.websiteScore : "none"}${data.visibilityScore != null ? ` · visibility ${data.visibilityScore}` : ""}`],
    ["Ranks", (data.ranks || []).map((r) => `${r.position ? `#${r.position}` : "n/a"} ${r.label}`).join("; ") || "—"],
    ["Top issues", (data.issues || []).slice(0, 4).map((x) => x.label).join("; ")], ["Report", pro ? (paid ? "PRO (paid)" : "PRO (founding, free)") : "basic"], ["Audit id", audit.id]];
  const html = `<h3 style="${F}">${paid ? "💵 Pro audit purchased" : "New audit lead"} — mesaintelligence.ai</h3><table style="${F};border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join("")}</table><p style="${F}">Full audit: https://mesaintelligence.ai/admin (Local Discovery)</p>`;
  return send(env, { to: [env.LEAD_TO], reply_to: contact.email, subject: `${paid ? "PAID " : ""}Audit lead: ${contact.business || audit.query || "local business"} — ${data.score}/100`, html, text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") });
}
