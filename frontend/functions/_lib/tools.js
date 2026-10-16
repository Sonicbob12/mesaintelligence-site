// Tools the agent can call. Each executor returns:
//   { result: string (what the model sees), event?: { name, summary, data } (what the UI shows) }

import { bookingsBetween, insertBooking, insertHandoff, insertLead } from "./db.js";
import { fmt, localDate, openSlots, parseWhen } from "./time.js";
import { notify } from "./notify.js";

export const TOOL_DEFS = [
  {
    name: "check_availability",
    description: "Look up open appointment times for a given date before offering times to the customer. Always call this rather than guessing availability.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD (business local time)" },
        service: { type: "string", description: "Service name from the services list, if known" },
      },
      required: ["date"],
    },
  },
  {
    name: "book_appointment",
    description: "Book an appointment or reservation once the customer has confirmed a specific time and given their name and phone number. Only call after confirming the details with the customer.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        phone: { type: "string", description: "Customer phone number" },
        email: { type: "string" },
        service: { type: "string", description: "Service name from the services list" },
        start: { type: "string", description: "Start time as 'YYYY-MM-DD HH:MM' in business local time, or an ISO slot from check_availability" },
        party_size: { type: "integer", description: "For reservations" },
        notes: { type: "string", description: "Anything the business should know (address, symptoms, special requests)" },
      },
      required: ["customer_name", "phone", "start"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Hand the conversation to a human when the request is outside your rules, is an emergency the business must handle directly, or the customer asks for a person. Tell the customer what happens next.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "One sentence on why" },
        urgency: { type: "string", enum: ["normal", "urgent"] },
        callback_phone: { type: "string" },
      },
      required: ["reason", "urgency"],
    },
  },
  {
    name: "capture_lead",
    description: "Save the customer's contact details and a summary when they want a quote, a callback, or more information but are not booking a specific time right now.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        summary: { type: "string", description: "What they want, in one or two sentences" },
      },
      required: ["summary"],
    },
  },
];

export async function runTool(env, ctx, name, input) {
  const { tenant, conversationId } = ctx;
  const tz = tenant.timezone || "America/Denver";
  try {
    switch (name) {
      case "check_availability": {
        const svc = findService(tenant, input.service);
        const duration = svc?.minutes || tenant.slot_minutes || 60;
        const date = String(input.date || "").slice(0, 10);
        const dayStart = parseWhen(date, tz);
        if (dayStart == null) return { result: "Invalid date. Use YYYY-MM-DD." };
        const existing = await bookingsBetween(env, tenant.id, Math.floor(dayStart / 1000), Math.floor(dayStart / 1000) + 86400);
        const avail = openSlots(tenant, date, duration, existing);
        if (avail.error) return { result: avail.error };
        if (avail.closed) return { result: `Closed on ${avail.weekday}. Open days: ${openDays(tenant)}.` };
        if (!avail.slots.length) return { result: `No open ${duration}-minute slots on ${date} (hours ${avail.hours[0]}–${avail.hours[1]}). Suggest another day.` };
        return {
          result: `Open ${duration}-minute slots on ${date} (${avail.weekday}): ${avail.slots.map((s) => s.label).join(", ")}. Offer two or three, not the whole list. When booking, pass start as "${date} HH:MM".`,
          event: { name, summary: `Checked ${date}: ${avail.slots.length} open`, data: { date, slots: avail.slots.map((s) => s.label) } },
        };
      }

      case "book_appointment": {
        const svc = findService(tenant, input.service);
        const duration = svc?.minutes || tenant.slot_minutes || 60;
        const startMs = parseWhen(input.start, tz);
        if (startMs == null) return { result: "Could not parse start time. Use 'YYYY-MM-DD HH:MM' in local time." };
        if (startMs < Date.now()) return { result: "That time is in the past. Check availability again." };
        const endMs = startMs + duration * 60e3;
        const date = localDate(new Date(startMs), tz).iso;
        const dayBookings = await bookingsBetween(env, tenant.id, Math.floor(startMs / 1000) - 86400, Math.floor(endMs / 1000) + 86400);
        const avail = openSlots(tenant, date, duration, dayBookings, 0, 200);
        const ok = !avail.closed && avail.slots.some((s) => s.start_ms === startMs);
        if (!ok) return { result: `That time is not available (closed, outside hours, or already booked). Call check_availability for ${date} and offer an open slot.` };
        const rec = await insertBooking(env, {
          tenant_id: tenant.id, conversation_id: conversationId,
          customer_name: String(input.customer_name || "").slice(0, 120),
          phone: String(input.phone || "").slice(0, 40), email: input.email ? String(input.email).slice(0, 200) : null,
          service: svc?.name || (input.service ? String(input.service).slice(0, 120) : null),
          start_at: Math.floor(startMs / 1000), end_at: Math.floor(endMs / 1000),
          notes: [input.party_size ? `Party of ${input.party_size}` : null, input.notes].filter(Boolean).join(". ").slice(0, 1000) || null,
        });
        const when = fmt(startMs, tz);
        const code = rec.id.slice(-6).toUpperCase();
        await notify(env, tenant, `New booking: ${rec.customer_name} — ${when}`, [
          ["Customer", rec.customer_name], ["Phone", rec.phone || "-"], ["Service", rec.service || "-"], ["When", when], ["Notes", rec.notes || "-"], ["Confirmation", code],
        ]);
        return {
          result: `Booked. Confirmation ${code}: ${rec.customer_name}, ${rec.service || "appointment"}, ${when}. Tell the customer the confirmation code and what to expect.`,
          event: { name, summary: `Booked ${rec.service || "appointment"} · ${when} · #${code}`, data: { confirmation: code, when, service: rec.service, customer: rec.customer_name } },
        };
      }

      case "escalate_to_human": {
        const rec = await insertHandoff(env, {
          tenant_id: tenant.id, conversation_id: conversationId,
          reason: String(input.reason || "").slice(0, 500), urgency: input.urgency === "urgent" ? "urgent" : "normal",
          callback_phone: input.callback_phone ? String(input.callback_phone).slice(0, 40) : null,
        });
        await notify(env, tenant, `${rec.urgency === "urgent" ? "URGENT " : ""}Handoff requested`, [
          ["Reason", rec.reason], ["Urgency", rec.urgency], ["Callback", rec.callback_phone || "-"], ["Conversation", conversationId || "-"],
        ]);
        const eta = rec.urgency === "urgent" ? "within 15 minutes during business hours" : "within one business day";
        return {
          result: `Handoff logged (${rec.urgency}). A team member will follow up ${eta}. Tell the customer this and confirm the callback number.`,
          event: { name, summary: `${rec.urgency === "urgent" ? "Urgent handoff" : "Handed to a human"} — ${rec.reason}`, data: { urgency: rec.urgency } },
        };
      }

      case "capture_lead": {
        const rec = await insertLead(env, {
          tenant_id: tenant.id, conversation_id: conversationId, source: ctx.channel || "chat",
          name: input.name ? String(input.name).slice(0, 120) : null, phone: input.phone ? String(input.phone).slice(0, 40) : null,
          email: input.email ? String(input.email).slice(0, 200) : null, summary: String(input.summary || "").slice(0, 1000),
        });
        await notify(env, tenant, `New lead: ${rec.name || "unknown"}`, [
          ["Name", rec.name || "-"], ["Phone", rec.phone || "-"], ["Email", rec.email || "-"], ["Summary", rec.summary],
        ]);
        return {
          result: "Lead saved. Confirm to the customer that someone will reach out, and ask if there's anything else.",
          event: { name, summary: `Saved lead${rec.name ? `: ${rec.name}` : ""}`, data: { name: rec.name } },
        };
      }

      default:
        return { result: `Unknown tool ${name}` };
    }
  } catch (e) {
    console.error("tool error", name, e?.message || e);
    return { result: `The ${name} action failed on our side. Apologize briefly and offer a callback instead.` };
  }
}

function findService(tenant, name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  const list = tenant.services || [];
  return list.find((s) => s.name.toLowerCase() === n) || list.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase())) || null;
}

function openDays(tenant) {
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return order.filter((d) => tenant.hours?.[d]).map((d) => `${d} ${tenant.hours[d][0]}–${tenant.hours[d][1]}`).join(", ");
}
