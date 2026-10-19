// POST /api/book/create { start, name, email, phone?, business?, notes?, a?, k?, o? }
// Books a 15-min call on SALES_CALENDAR_ID, emails both sides, and — when tied to an audit (a + k) —
// unlocks the Pro report for free and emails it (the outbound offer). Marks the outreach row booked.
import { googleConfigured, createCalendarEvent, busyWindows } from "../../_lib/google.js";
import { loadAudit } from "../../_lib/audit.js";
import { unlockPro, reportLink } from "../../_lib/audit_pro.js";
import { setStatus } from "../../_lib/outbound.js";
import { hasDB, hit, id, now } from "../../_lib/db.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

const TZ = "America/Denver";
const when = (ms) => new Date(ms).toLocaleString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export async function onRequestPost({ request, env, waitUntil }) {
  const b = (await readJSON(request)) || {};
  if (b.website) return json({ ok: true }); // honeypot
  const name = String(b.name || "").trim().slice(0, 120), email = String(b.email || "").trim().slice(0, 200), phone = String(b.phone || "").trim().slice(0, 40);
  const business = String(b.business || "").trim().slice(0, 160), notes = String(b.notes || "").trim().slice(0, 600);
  const start = Number(b.start); const slotMin = Number(env.SALES_SLOT_MIN || 15); const end = start + slotMin * 60000;
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ detail: "Add your name and a valid email." }, 400);
  if (!Number.isFinite(start) || start < Date.now()) return json({ detail: "Pick a time in the future." }, 400);
  const lim = await hit(env, `book:${clientIp(request)}`, 3600, 5);
  if (!lim.allowed) return json({ detail: "Too many attempts — email hello@mesaintelligence.ai." }, 429);

  // Still free? (someone else may have booked meanwhile)
  if (googleConfigured(env) && env.SALES_CALENDAR_ID) {
    const busy = await busyWindows(env, env.SALES_CALENDAR_ID, start - 3600000, end + 3600000).catch(() => []);
    if (busy.some((w) => start < w.endMs && end > w.startMs)) return json({ detail: "That time was just taken — pick another." }, 409);
  }

  const audit = b.a ? await loadAudit(env, String(b.a)) : null;
  const tied = audit && audit.share_key && audit.share_key === String(b.k || "");
  const outreachId = String(b.o || "").slice(0, 40);
  const bizName = business || audit?.full?.place?.name || audit?.business_name || "";
  const link = tied ? reportLink(env, audit.id, audit.share_key) : null;

  let event = null;
  if (googleConfigured(env) && env.SALES_CALENDAR_ID) {
    try {
      event = await createCalendarEvent(env, env.SALES_CALENDAR_ID, {
        summary: `Mesa call — ${bizName || name}`, startMs: start, endMs: end, timeZone: TZ,
        description: [`${name} <${email}>${phone ? ` · ${phone}` : ""}`, bizName ? `Business: ${bizName}` : "", link ? `Audit: ${link}` : "", notes ? `Notes: ${notes}` : "", outreachId ? `Outreach: ${outreachId}` : ""].filter(Boolean).join("\n"),
      });
    } catch (e) { console.error("book event", e?.message || e); }
  }
  const bk = { id: id("bk"), outreach_id: outreachId || null, audit_id: tied ? audit.id : null, name, email, phone, business: bizName, start_at: Math.floor(start / 1000), end_at: Math.floor(end / 1000), calendar_event_id: event?.id || null, notes, source: outreachId ? "outbound" : tied ? "audit" : "site", created_at: now() };
  if (hasDB(env)) {
    await env.DB.prepare("INSERT INTO sales_bookings (id, outreach_id, audit_id, name, email, phone, business, start_at, end_at, calendar_event_id, notes, source, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)")
      .bind(bk.id, bk.outreach_id, bk.audit_id, bk.name, bk.email, bk.phone || null, bk.business || null, bk.start_at, bk.end_at, bk.calendar_event_id, bk.notes || null, bk.source, bk.created_at).run();
    if (outreachId) await setStatus(env, outreachId, "booked", { booked_at: now() }).catch(() => {});
    if (tied && !audit.contact_email) await env.DB.prepare("UPDATE audits SET contact_name = ?2, contact_email = ?3, contact_phone = ?4, business_name = COALESCE(business_name, ?5) WHERE id = ?1").bind(audit.id, name, email, phone || null, bizName || null).run();
  }

  const bg = [];
  // The offer: booking = free Pro report (emailed by unlockPro).
  if (tied && !audit.pro) bg.push(unlockPro(env, audit.id, { waitUntil, email: true }).catch((e) => console.error("book unlock", e?.message || e)));
  bg.push(sendMail(env, { to: [email], reply_to: env.LEAD_TO, subject: `Confirmed: 15-minute call with Bobby — ${when(start)}`,
    text: `Hi ${name.split(" ")[0]},\n\nYou're booked for ${when(start)} (${slotMin} minutes). I'll call you${phone ? ` at ${phone}` : " — reply with the best number"}.\n\n${tied ? `Your full Pro report is on its way in a separate email${link ? ` (also here: ${link})` : ""}.\n\n` : ""}Need to move it? Just reply to this email.\n\nBobby Lloyd\nMesa Intelligence · Las Cruces, NM · (575) 254-1185` }));
  if (env.LEAD_TO) bg.push(sendMail(env, { to: [env.LEAD_TO], reply_to: email, subject: `📅 Call booked: ${bizName || name} — ${when(start)}`,
    text: `${name} <${email}>${phone ? ` · ${phone}` : ""}\nBusiness: ${bizName || "—"}\nWhen: ${when(start)}\nSource: ${bk.source}${link ? `\nAudit: ${link}` : ""}${notes ? `\nNotes: ${notes}` : ""}${event?.link ? `\nCalendar: ${event.link}` : "\n(No calendar event — set SALES_CALENDAR_ID)"}` }));
  const all = Promise.all(bg);
  if (typeof waitUntil === "function") waitUntil(all); else await all;
  return json({ ok: true, start, end, when: when(start), pro: Boolean(tied), link, calendar: Boolean(event) });
}

async function sendMail(env, msg) {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from: env.OUTBOUND_FROM || env.LEAD_FROM || "Mesa Intelligence <hello@mesaintelligence.ai>", ...msg }) });
  if (!res.ok) console.error("book mail", res.status, await res.text().catch(() => ""));
  return res.ok;
}
