// Workflow Intelligence: what happens after the conversation.
// A "run" is triggered by a booking, lead, hand-off or finished call. Each run executes a chain of
// steps (confirmation SMS, calendar event, CRM row, owner notification, reminder scheduling) and
// records every step with status + timing in `workflow_runs`, so the site can show the chain live
// and the admin can see what fired. Steps that aren't configured are recorded as "skipped".
//
// Per-tenant settings live in tenants.workflows_json:
//   { sms: true, calendar_id: "...@group.calendar.google.com", sheet_id: "1AbC…", sheet_tab: "Sheet1",
//     reminders: true, digest_hour: 18 }
// Demo tenants fall back to DEMO_CALENDAR_ID / DEMO_SHEET_ID env vars so the homepage demo is real.

import { hasDB, id, now, hit } from "./db.js";
import { notify } from "./notify.js";
import { sendSms, twilioConfigured, toE164 } from "./twilio.js";
import { createCalendarEvent, appendSheetRow, googleConfigured } from "./google.js";
import { fmt } from "./time.js";

const mem = { runs: [] };
const STEP_TIMEOUT_MS = 8000;

export function workflowSettings(env, tenant) {
  const w = tenant.workflows || {};
  const demo = Boolean(tenant.demo);
  return {
    sms: w.sms !== false,
    calendar_id: w.calendar_id || (demo ? env.DEMO_CALENDAR_ID : null) || null,
    sheet_id: w.sheet_id || (demo ? env.DEMO_SHEET_ID : null) || null,
    sheet_tab: w.sheet_tab || "Sheet1",
    reminders: w.reminders !== false,
    digest_hour: Number.isFinite(Number(w.digest_hour)) ? Number(w.digest_hour) : 18,
  };
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`Timed out after ${ms / 1000}s`)), ms))]);
}

const looksFake = (phone) => { const d = String(phone || "").replace(/\D/g, "").slice(-10); return !d || /^(\d)\1{9}$/.test(d) || /^\d{3}555\d{4}$/.test(d) || d.startsWith("000"); };

// ---------------------------------------------------------------------------
// Trigger: payload shapes
//   booking: { kind:"booking", rec, tz }        lead: { kind:"lead", rec }
//   handoff: { kind:"handoff", rec }            call: { kind:"call", summary, from, needsFollowup, mins, sentiment, callerName, callbackPhone }
export async function runWorkflow(env, tenant, conversationId, payload) {
  const s = workflowSettings(env, tenant);
  const run = { id: id("wf"), tenant_id: tenant.id, conversation_id: conversationId || null, trigger: payload.kind, ref_id: payload.rec?.id || null, steps: [], status: "running", created_at: now(), updated_at: now() };
  const step = (key, label) => { const st = { key, label, status: "pending", detail: "", at: null, ms: null }; run.steps.push(st); return st; };

  const customerPhone = payload.rec?.phone || payload.callbackPhone || null;
  const customerName = payload.rec?.customer_name || payload.rec?.name || payload.callerName || "";
  const first = String(customerName).trim().split(/\s+/)[0] || "";

  // 1) Confirmation / acknowledgement SMS to the customer
  const smsStep = step("sms", payload.kind === "booking" ? "Confirmation text to customer" : "Acknowledgement text to customer");
  // 2) Calendar event (bookings only)
  const calStep = payload.kind === "booking" ? step("calendar", "Calendar event on the business calendar") : null;
  // 3) CRM row
  const sheetStep = step("sheet", "Row added to the CRM sheet");
  // 4) Owner notification
  const ownerStep = step("owner", "Owner notified by email");
  // 5) Reminder scheduling (bookings only)
  const remStep = payload.kind === "booking" ? step("reminder", "Day-before reminder scheduled") : null;

  await persistRun(env, run);

  const tasks = [];

  tasks.push(execStep(env, smsStep, async () => {
    if (!s.sms) return skip("Texting is off for this business");
    if (!twilioConfigured(env)) return skip("Twilio not connected yet");
    if (!customerPhone || !toE164(customerPhone)) return skip("No valid mobile number given");
    if (tenant.demo && looksFake(customerPhone)) return skip("Demo: not texting a placeholder number");
    if (tenant.demo) { const cap = await hit(env, "wf-sms:daily", 86400, Number(env.DEMO_SMS_DAILY_CAP || 30)); if (!cap.allowed) return skip("Demo text cap reached for today"); }
    const body = smsBody(tenant, payload, first);
    const r = await sendSms(env, { to: customerPhone, body, from: tenant.sms_number || undefined });
    return `Sent to ${mask(r.to)}`;
  }));

  if (calStep) tasks.push(execStep(env, calStep, async () => {
    if (!googleConfigured(env)) return skip("Google not connected yet");
    if (!s.calendar_id) return skip("No calendar chosen for this business");
    const rec = payload.rec;
    const ev = await createCalendarEvent(env, s.calendar_id, {
      summary: `${rec.service || "Appointment"} — ${rec.customer_name}${tenant.demo ? " (demo)" : ""}`,
      description: [`Booked by the ${tenant.name} AI agent.`, rec.phone ? `Phone: ${rec.phone}` : null, rec.email ? `Email: ${rec.email}` : null, rec.notes ? `Notes: ${rec.notes}` : null, `Confirmation: ${rec.id.slice(-6).toUpperCase()}`].filter(Boolean).join("\n"),
      startMs: rec.start_at * 1000, endMs: rec.end_at * 1000, timeZone: tenant.timezone,
    });
    return `Event created${ev.link ? ` — ${ev.link}` : ""}`;
  }));

  tasks.push(execStep(env, sheetStep, async () => {
    if (!googleConfigured(env)) return skip("Google not connected yet");
    if (!s.sheet_id) return skip("No CRM sheet chosen for this business");
    const r = await appendSheetRow(env, s.sheet_id, sheetRow(tenant, payload, conversationId), s.sheet_tab);
    return `Added${r.range ? ` at ${r.range.replace(/^[^!]*!/, "")}` : ""}`;
  }));

  tasks.push(execStep(env, ownerStep, async () => {
    // Demo businesses forward to DEMO_NOTIFY_EMAIL (Mesa's inbox) so the chain is real on the homepage.
    const ownerEmail = tenant.notify_email || (tenant.demo ? env.DEMO_NOTIFY_EMAIL : null);
    if (!ownerEmail) return skip(tenant.demo ? "Demo business has no inbox" : "No owner email set");
    if (!env.RESEND_API_KEY) return skip("Email not configured");
    const { subject, rows, extra } = ownerMessage(tenant, payload);
    const ok = await notify(env, { ...tenant, notify_email: ownerEmail }, subject, rows, extra);
    if (!ok) throw new Error("Email send failed");
    return `Emailed ${tenant.demo ? "the owner's inbox" : ownerEmail}`;
  }));

  if (remStep) tasks.push(execStep(env, remStep, async () => {
    if (!s.reminders) return skip("Reminders are off for this business");
    if (!twilioConfigured(env)) return skip("Twilio not connected yet");
    if (!customerPhone || !toE164(customerPhone) || (tenant.demo && looksFake(customerPhone))) return skip("No valid mobile number to remind");
    const due = payload.rec.start_at - 24 * 3600;
    if (due <= now() + 600) return skip("Appointment is less than a day away");
    run.reminder_due = due;
    return `Text goes out ${fmt(due * 1000, tenant.timezone)}`;
  }));

  await Promise.allSettled(tasks);
  run.status = run.steps.some((x) => x.status === "failed") ? "partial" : "done";
  run.updated_at = now();
  await persistRun(env, run);
  return run;
}

const skip = (why) => ({ skipped: why });
const mask = (e164) => e164.replace(/^(\+1\d{3})\d{3}(\d{4})$/, "$1•••$2");

async function execStep(env, st, fn) {
  const t0 = Date.now();
  st.status = "running";
  try {
    const out = await withTimeout(fn(), STEP_TIMEOUT_MS);
    if (out && typeof out === "object" && out.skipped) { st.status = "skipped"; st.detail = out.skipped; }
    else { st.status = "done"; st.detail = String(out || "Done"); }
  } catch (e) {
    st.status = "failed"; st.detail = String(e?.message || e).slice(0, 200);
    console.error("workflow step", st.key, st.detail);
  }
  st.at = now(); st.ms = Date.now() - t0;
}

function smsBody(tenant, p, first) {
  const hi = first ? `Hi ${first}, ` : "";
  if (p.kind === "booking") {
    const when = fmt(p.rec.start_at * 1000, tenant.timezone);
    return `${hi}this is ${tenant.name}. You're booked: ${p.rec.service || "appointment"} on ${when}. Confirmation ${p.rec.id.slice(-6).toUpperCase()}. Reply to this text if anything changes.${tenant.demo ? " (Demo by Mesa Intelligence)" : ""}`;
  }
  if (p.kind === "handoff") return `${hi}this is ${tenant.name}. We got your request and a team member will call you back ${p.rec.urgency === "urgent" ? "shortly" : "within one business day"}.${tenant.demo ? " (Demo by Mesa Intelligence)" : ""}`;
  return `${hi}this is ${tenant.name}. Thanks for reaching out — we have your details and someone will follow up soon.${tenant.demo ? " (Demo by Mesa Intelligence)" : ""}`;
}

function sheetRow(tenant, p, conversationId) {
  const ts = new Date().toLocaleString("en-US", { timeZone: tenant.timezone });
  const r = p.rec || {};
  if (p.kind === "booking") return [ts, "Booking", r.customer_name || "", r.phone || "", r.email || "", r.service || "", fmt(r.start_at * 1000, tenant.timezone), r.notes || "", r.id.slice(-6).toUpperCase(), conversationId || ""];
  if (p.kind === "lead") return [ts, "Lead", r.name || "", r.phone || "", r.email || "", "", "", r.summary || "", "", conversationId || ""];
  if (p.kind === "handoff") return [ts, `Hand-off (${r.urgency})`, "", r.callback_phone || "", "", "", "", r.reason || "", "", conversationId || ""];
  return [ts, p.needsFollowup ? "Call — follow up" : "Call", p.callerName || "", p.callbackPhone || p.from || "", "", "", "", p.summary || "", "", conversationId || ""];
}

function ownerMessage(tenant, p) {
  const r = p.rec || {};
  if (p.kind === "booking") {
    const when = fmt(r.start_at * 1000, tenant.timezone);
    return { subject: `New booking: ${r.customer_name} — ${when}`, rows: [["Customer", r.customer_name], ["Phone", r.phone || "-"], ["Service", r.service || "-"], ["When", when], ["Notes", r.notes || "-"], ["Confirmation", r.id.slice(-6).toUpperCase()]] };
  }
  if (p.kind === "handoff") return { subject: `${r.urgency === "urgent" ? "URGENT " : ""}Handoff requested`, rows: [["Reason", r.reason], ["Urgency", r.urgency], ["Callback", r.callback_phone || "-"]] };
  if (p.kind === "lead") return { subject: `New lead: ${r.name || "unknown"}`, rows: [["Name", r.name || "-"], ["Phone", r.phone || "-"], ["Email", r.email || "-"], ["Summary", r.summary]] };
  return { subject: `${p.needsFollowup ? "Follow-up needed: " : ""}Call from ${p.from || "web"}`, rows: [["Caller", p.callerName || "-"], ["Number", p.callbackPhone || p.from || "-"], ["Length", p.mins != null ? `${p.mins} min` : "-"], ["Outcome", p.needsFollowup ? "needs follow-up" : "handled"], ["Sentiment", p.sentiment || "-"]], extra: p.summary || "" };
}

// ---------------------------------------------------------------------------
// storage
async function persistRun(env, run) {
  if (!hasDB(env)) { const i = mem.runs.findIndex((r) => r.id === run.id); if (i >= 0) mem.runs[i] = run; else mem.runs.unshift(run); mem.runs.length = Math.min(mem.runs.length, 200); return; }
  await env.DB.prepare(
    `INSERT INTO workflow_runs (id, tenant_id, conversation_id, trigger, ref_id, status, steps_json, reminder_due, reminder_sent, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?10)
     ON CONFLICT(id) DO UPDATE SET status=?6, steps_json=?7, reminder_due=?8, updated_at=?10`
  ).bind(run.id, run.tenant_id, run.conversation_id, run.trigger, run.ref_id, run.status, JSON.stringify(run.steps), run.reminder_due || null, run.created_at, run.updated_at).run();
}

const rowToRun = (r) => ({ id: r.id, tenant_id: r.tenant_id, conversation_id: r.conversation_id, trigger: r.trigger, ref_id: r.ref_id, status: r.status, steps: JSON.parse(r.steps_json || "[]"), reminder_due: r.reminder_due, reminder_sent: Boolean(r.reminder_sent), created_at: r.created_at, updated_at: r.updated_at });

export async function runsForConversation(env, conversationId, limit = 5) {
  if (!hasDB(env)) return mem.runs.filter((r) => r.conversation_id === conversationId).slice(0, limit);
  const { results } = await env.DB.prepare("SELECT * FROM workflow_runs WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?").bind(conversationId, limit).all();
  return (results || []).map(rowToRun);
}

export async function recentRuns(env, tenantId, limit = 50) {
  if (!hasDB(env)) return mem.runs.filter((r) => !tenantId || r.tenant_id === tenantId).slice(0, limit);
  const q = tenantId ? env.DB.prepare("SELECT * FROM workflow_runs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?").bind(tenantId, limit)
                     : env.DB.prepare("SELECT * FROM workflow_runs ORDER BY created_at DESC LIMIT ?").bind(limit);
  const { results } = await q.all();
  return (results || []).map(rowToRun);
}

// Public view: hides phone numbers/links for demo visitors; keeps the chain + timings.
export function publicRun(run) {
  return { id: run.id, trigger: run.trigger, status: run.status, created_at: run.created_at,
    steps: run.steps.map((s) => ({ key: s.key, label: s.label, status: s.status, at: s.at, ms: s.ms, detail: s.detail.replace(/https?:\/\/\S+/g, "(link)") })) };
}

// ---------------------------------------------------------------------------
// Scheduled work (called by /api/cron/tick, which an external cron pings hourly).
export async function sendDueReminders(env, loadTenant) {
  if (!hasDB(env) || !twilioConfigured(env)) return { sent: 0 };
  const t = now();
  const { results } = await env.DB.prepare(
    "SELECT r.*, b.customer_name, b.phone, b.service, b.start_at FROM workflow_runs r JOIN bookings b ON b.id = r.ref_id WHERE r.reminder_due IS NOT NULL AND r.reminder_sent = 0 AND r.reminder_due <= ? AND b.status = 'confirmed' AND b.start_at > ? LIMIT 50"
  ).bind(t, t).all();
  let sent = 0;
  for (const r of results || []) {
    const tenant = await loadTenant(env, r.tenant_id);
    if (!tenant) continue;
    try {
      const first = String(r.customer_name || "").split(/\s+/)[0];
      await sendSms(env, { to: r.phone, from: tenant.sms_number || undefined, body: `${first ? `Hi ${first}, ` : ""}reminder from ${tenant.name}: ${r.service || "your appointment"} is ${fmt(r.start_at * 1000, tenant.timezone)}. Reply if you need to reschedule.` });
      sent++;
    } catch (e) { console.error("reminder", r.id, e?.message || e); }
    await env.DB.prepare("UPDATE workflow_runs SET reminder_sent = 1 WHERE id = ?").bind(r.id).run();
  }
  return { sent };
}

// Owner digest: one email per business with notify_email, sent once per local day at digest_hour.
export async function sendDigests(env, tenants) {
  if (!hasDB(env) || !env.RESEND_API_KEY) return { sent: 0 };
  let sent = 0;
  for (const tenant of tenants) {
    if (!tenant.notify_email) continue;
    const s = workflowSettings(env, tenant);
    const local = new Date(new Date().toLocaleString("en-US", { timeZone: tenant.timezone }));
    if (local.getHours() < s.digest_hour) continue;
    const dayKey = `digest:${tenant.id}:${local.toISOString().slice(0, 10)}`;
    const once = await hit(env, dayKey, 86400 * 2, 1);
    if (!once.allowed) continue;
    const since = now() - 86400;
    const [b, l, h, c] = await Promise.all([
      env.DB.prepare("SELECT customer_name, service, start_at, phone FROM bookings WHERE tenant_id = ? AND created_at > ? ORDER BY start_at").bind(tenant.id, since).all(),
      env.DB.prepare("SELECT name, phone, summary FROM leads WHERE tenant_id = ? AND created_at > ?").bind(tenant.id, since).all(),
      env.DB.prepare("SELECT reason, urgency, callback_phone FROM handoffs WHERE tenant_id = ? AND created_at > ?").bind(tenant.id, since).all(),
      env.DB.prepare("SELECT channel, COUNT(*) n FROM conversations WHERE tenant_id = ? AND updated_at > ? GROUP BY channel").bind(tenant.id, since).all(),
    ]);
    const B = b.results || [], L = l.results || [], H = h.results || [], C = c.results || [];
    if (!B.length && !L.length && !H.length && !C.length) continue;
    const rows = [
      ["Conversations", C.map((x) => `${x.n} ${x.channel}`).join(", ") || "0"],
      ["Bookings", String(B.length)], ["Leads", String(L.length)], ["Hand-offs", String(H.length)],
    ];
    const extra = [
      ...B.map((x) => `BOOKED  ${fmt(x.start_at * 1000, tenant.timezone)} — ${x.customer_name} — ${x.service || ""} — ${x.phone || ""}`),
      ...L.map((x) => `LEAD    ${x.name || "unknown"} — ${x.phone || ""} — ${x.summary || ""}`),
      ...H.map((x) => `HANDOFF ${x.urgency.toUpperCase()} — ${x.reason} — ${x.callback_phone || ""}`),
    ].join("\n");
    if (await notify(env, tenant, `Daily digest — ${local.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`, rows, extra)) sent++;
  }
  return { sent };
}
