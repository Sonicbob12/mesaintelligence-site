// Tenant = one business the agent works for. The four demo tenants live here
// as code so the demo works with zero setup; real clients are rows in D1
// (table `tenants`) and override these by id.
//
// Shape:
//   id, name, vertical, timezone, persona (system prompt body),
//   hours { mon..sun: ["HH:MM","HH:MM"] | null }, slot_minutes,
//   services [{ name, minutes, price }], escalation (free text rules),
//   notify_email (where handoffs/leads go; null = log only), sms_number,
//   greeting, presets [], demo (bool)

import { hasDB, safeJSON } from "./db.js";
import { DEMO_KNOWLEDGE } from "./demo_knowledge.js";

const WEEKDAYS = ["07:00", "19:00"];

export const DEMO_TENANTS = {
  "desert-peak-hvac": {
    id: "desert-peak-hvac",
    name: "Desert Peak HVAC",
    vertical: "hvac",
    timezone: "America/Denver",
    greeting: "Desert Peak HVAC, this is Mesa — how can I help you today?",
    presets: ["My AC died and it's 110° outside", "Do you offer maintenance plans?", "Book me a tune-up next week"],
    persona:
      "You are the AI dispatch assistant for Desert Peak HVAC, a family-run heating and cooling company in Las Cruces, NM. " +
      "Act like their best front-desk dispatcher: warm, quick, and always moving toward a booked job. " +
      "Triage first: no cooling in extreme heat, gas smell, or water leaking near electrical is an EMERGENCY — offer the next emergency slot and quote the after-hours fee. " +
      "Keep replies to 2–4 sentences. Never invent prices or policies; use the knowledge provided. If something is outside what you know, say so and offer a callback.",
    hours: { mon: WEEKDAYS, tue: WEEKDAYS, wed: WEEKDAYS, thu: WEEKDAYS, fri: WEEKDAYS, sat: WEEKDAYS, sun: null },
    slot_minutes: 120,
    services: [
      { name: "Diagnostic visit", minutes: 120, price: 89 },
      { name: "AC tune-up", minutes: 90, price: 129 },
      { name: "Furnace tune-up", minutes: 90, price: 129 },
      { name: "Emergency service", minutes: 120, price: 89, note: "after-hours fee, plus repair" },
      { name: "Maintenance plan enrollment", minutes: 30, price: 18, note: "per month" },
    ],
    escalation: "Escalate to a human for: gas smell (tell caller to leave the house and call the gas company first), commercial jobs, warranty disputes, anything about pricing a full system replacement.",
    notify_email: null,
    sms_number: null,
    demo: true,
  },
  "juniper-vine": {
    id: "juniper-vine",
    name: "Juniper & Vine",
    vertical: "restaurant",
    timezone: "America/Denver",
    greeting: "Good evening, Juniper & Vine — how may I seat you?",
    presets: ["Table for two this Friday at 7?", "Do you have vegan options?", "Can you do a party of 12?"],
    persona:
      "You are the host AI for Juniper & Vine, a farm-to-table bistro in Mesilla, NM. " +
      "Handle reservations (party size, date, time, name, phone), menu and dietary questions, and private-event enquiries. " +
      "Be charming and concise (2–4 sentences). Always confirm the details back like a real host before booking. " +
      "Never invent menu items or prices; use the knowledge provided.",
    hours: { mon: null, tue: ["17:00", "21:30"], wed: ["17:00", "21:30"], thu: ["17:00", "21:30"], fri: ["17:00", "22:00"], sat: ["17:00", "22:00"], sun: ["10:00", "14:00"] },
    slot_minutes: 30,
    services: [
      { name: "Dinner reservation", minutes: 90, price: 0 },
      { name: "Sunday brunch reservation", minutes: 90, price: 0 },
      { name: "Private dining (8–24 guests)", minutes: 180, price: 0, note: "deposit required" },
    ],
    escalation: "Escalate to a human for: parties larger than 12, buyouts, allergy questions you cannot answer from the knowledge base, complaints about a past visit.",
    notify_email: null,
    sms_number: null,
    demo: true,
  },
  "red-rock-dental": {
    id: "red-rock-dental",
    name: "Red Rock Dental",
    vertical: "dental",
    timezone: "America/Denver",
    greeting: "Thanks for calling Red Rock Dental — what can I do for you?",
    presets: ["I need to book a cleaning", "Do you take Delta Dental?", "My tooth is killing me"],
    persona:
      "You are the patient intake assistant for Red Rock Dental in Las Cruces, NM. " +
      "Help patients book cleanings and appointments, answer insurance and pricing questions from the knowledge provided, and calm anxious patients. " +
      "Be reassuring and concise (2–4 sentences). You are not a clinician: never diagnose. Severe pain, swelling, or a knocked-out tooth is urgent — offer the next same-day slot. " +
      "Collect name and phone before booking.",
    hours: { mon: ["08:00", "17:00"], tue: ["08:00", "17:00"], wed: ["08:00", "17:00"], thu: ["08:00", "17:00"], fri: ["08:00", "13:00"], sat: null, sun: null },
    slot_minutes: 60,
    services: [
      { name: "Cleaning & exam", minutes: 60, price: 149 },
      { name: "New patient exam + x-rays", minutes: 90, price: 199 },
      { name: "Emergency / toothache visit", minutes: 60, price: 95 },
      { name: "Whitening consult", minutes: 30, price: 0 },
    ],
    escalation: "Escalate to a human for: billing disputes, prescription questions, anything clinical beyond scheduling, facial swelling with fever (tell them to seek urgent care if after hours).",
    notify_email: null,
    sms_number: null,
    demo: true,
  },
  "mesa-grant-legal": {
    id: "mesa-grant-legal",
    name: "Mesa & Grant Legal",
    vertical: "legal",
    timezone: "America/Denver",
    greeting: "Mesa & Grant Legal, intake desk — tell me briefly what's going on.",
    presets: ["I need help with a lease dispute", "What does a consultation cost?", "Can you form an LLC for me?"],
    persona:
      "You are the intake assistant for Mesa & Grant Legal, a small-business law firm in Las Cruces, NM. " +
      "Screen enquiries (contract review, lease disputes, entity formation, employment matters), explain the free 20-minute consultation, and book it. " +
      "Be professional and concise (2–4 sentences). You never give legal advice and you say so plainly if asked for it. " +
      "Collect name, phone, and a one-line summary of the matter before booking. Do not ask for sensitive details in chat.",
    hours: { mon: ["09:00", "17:00"], tue: ["09:00", "17:00"], wed: ["09:00", "17:00"], thu: ["09:00", "17:00"], fri: ["09:00", "16:00"], sat: null, sun: null },
    slot_minutes: 30,
    services: [
      { name: "Free consultation (20 min)", minutes: 30, price: 0 },
      { name: "Contract review", minutes: 60, price: 350, note: "flat fee for documents under 15 pages" },
      { name: "LLC formation", minutes: 60, price: 900, note: "includes state filing fees" },
    ],
    escalation: "Escalate to a human for: criminal matters, family law, personal injury (the firm does not handle these — refer out), anyone describing an emergency or a court date within 7 days.",
    notify_email: null,
    sms_number: null,
    demo: true,
  },
};

// Backward-compat keys the old widget used
export const LEGACY_KEYS = { hvac: "desert-peak-hvac", restaurant: "juniper-vine", dental: "red-rock-dental", legal: "mesa-grant-legal" };

export function resolveTenantId(key) {
  if (!key) return null;
  return LEGACY_KEYS[key] || key;
}

export async function loadTenant(env, key) {
  const tid = resolveTenantId(key);
  if (!tid) return null;
  if (hasDB(env)) {
    const row = await env.DB.prepare("SELECT * FROM tenants WHERE id = ? AND active = 1").bind(tid).first();
    if (row) return rowToTenant(row);
  }
  return DEMO_TENANTS[tid] || null;
}

export async function tenantBySmsNumber(env, number) {
  if (hasDB(env)) {
    const row = await env.DB.prepare("SELECT * FROM tenants WHERE sms_number = ? AND active = 1").bind(number).first();
    if (row) return rowToTenant(row);
  }
  return Object.values(DEMO_TENANTS).find((t) => t.sms_number === number) || null;
}

export async function listTenants(env) {
  const out = { ...DEMO_TENANTS };
  if (hasDB(env)) {
    const { results } = await env.DB.prepare("SELECT * FROM tenants ORDER BY name").all();
    for (const r of results || []) out[r.id] = rowToTenant(r);
  }
  return Object.values(out);
}

export function rowToTenant(r) {
  return {
    id: r.id, name: r.name, vertical: r.vertical, timezone: r.timezone || "America/Denver",
    greeting: r.greeting, presets: safeJSON(r.presets_json, []), persona: r.persona,
    hours: safeJSON(r.hours_json, {}), slot_minutes: r.slot_minutes || 60,
    services: safeJSON(r.services_json, []), escalation: r.escalation || "",
    notify_email: r.notify_email || null, sms_number: r.sms_number || null,
    voice_number: r.voice_number || null, transfer_number: r.transfer_number || null, voice_id: r.voice_id || null,
    retell_agent_id: r.retell_agent_id || null, retell_llm_id: r.retell_llm_id || null,
    demo: Boolean(r.demo), active: r.active !== 0,
  };
}

export function tenantToRow(t) {
  return [
    t.id, t.name, t.vertical || null, t.timezone || "America/Denver", t.greeting || "",
    JSON.stringify(t.presets || []), t.persona || "", JSON.stringify(t.hours || {}), t.slot_minutes || 60,
    JSON.stringify(t.services || []), t.escalation || "", t.notify_email || null, t.sms_number || null,
    t.demo ? 1 : 0, t.active === false ? 0 : 1,
    t.voice_number || null, t.transfer_number || null, t.voice_id || null,
  ];
}

// Public (client-safe) view: no persona/escalation text.
export function publicTenant(t) {
  return { id: t.id, name: t.name, vertical: t.vertical, greeting: t.greeting, presets: t.presets, demo: Boolean(t.demo), timezone: t.timezone,
           voice_number: t.voice_number || null, voice: Boolean(t.retell_agent_id) };
}

export async function tenantByVoiceNumber(env, number) {
  if (!number) return null;
  if (hasDB(env)) {
    const row = await env.DB.prepare("SELECT * FROM tenants WHERE voice_number = ? AND active = 1").bind(number).first();
    if (row) return rowToTenant(row);
  }
  return Object.values(DEMO_TENANTS).find((t) => t.voice_number === number) || null;
}

// Built-in knowledge for demo tenants (used when D1 has no rows for them).
export function demoKnowledge(tenantId) {
  return DEMO_KNOWLEDGE[tenantId] || [];
}
