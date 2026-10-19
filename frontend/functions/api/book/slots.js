// GET /api/book/slots?a=<audit_id>&k=<share_key>  → open 15-minute call slots for the next 10 business days.
// Availability: SALES_HOURS (default "09:00-17:00"), SALES_DAYS (default "mon,tue,wed,thu,fri"), minus events on
// SALES_CALENDAR_ID (a Google Calendar shared with the service account). Lead time SALES_LEAD_HOURS (default 18).
import { googleConfigured, busyWindows } from "../../_lib/google.js";
import { zonedToUtc, localDate } from "../../_lib/time.js";
import { json } from "../../_lib/http.js";

const TZ = "America/Denver";
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const slotMin = Number(env.SALES_SLOT_MIN || 15), stepMin = Number(env.SALES_STEP_MIN || 30);
  const [h0, h1] = String(env.SALES_HOURS || "09:00-17:00").split("-").map((s) => s.split(":").map(Number));
  const days = new Set(String(env.SALES_DAYS || "mon,tue,wed,thu,fri").split(",").map((s) => s.trim().toLowerCase()));
  const lead = Date.now() + Number(env.SALES_LEAD_HOURS || 18) * 3600000;
  const horizon = Date.now() + 14 * 86400000;
  let busy = [];
  if (googleConfigured(env) && env.SALES_CALENDAR_ID) {
    try { busy = await busyWindows(env, env.SALES_CALENDAR_ID, Date.now(), horizon); } catch (e) { console.error("slots busy", e?.message || e); }
  }
  const out = [];
  for (let i = 0; i < 14 && out.length < 60; i++) {
    const d = localDate(new Date(Date.now() + i * 86400000), TZ);
    if (!days.has(d.weekday)) continue;
    for (let m = h0[0] * 60 + (h0[1] || 0); m + slotMin <= h1[0] * 60 + (h1[1] || 0); m += stepMin) {
      const start = zonedToUtc(d.y, d.m, d.d, Math.floor(m / 60), m % 60, TZ), end = start + slotMin * 60000;
      if (start < lead) continue;
      if (busy.some((b) => start < b.endMs && end > b.startMs)) continue;
      out.push({ start, end });
    }
  }
  return json({ tz: TZ, slotMin, slots: out, calendar: Boolean(env.SALES_CALENDAR_ID) });
}
