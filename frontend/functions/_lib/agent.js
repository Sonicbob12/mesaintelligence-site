// The agent: one turn of conversation for one tenant on one channel.
//
//   for await (const evt of agentTurn({ env, tenant, conversation, message, channel, ip })) ...
//
// Events are the same as runModel() plus { type: "notice", text } for
// rate-limit / turn-cap messages. The conversation is persisted on "done".

import { hit, id, saveConversation } from "./db.js";
import { retrieve } from "./retrieval.js";
import { TOOL_DEFS, runTool } from "./tools.js";
import { runModel } from "./anthropic.js";
import { nowDescription } from "./time.js";

const MAX_CHARS = 600;           // per user message
const DEMO_MAX_TURNS = 14;       // per demo conversation
const HISTORY_MESSAGES = 24;     // kept in context (older turns are dropped)

export async function* agentTurn({ env, tenant, conversation, message, channel = "web", ip = "0.0.0.0" }) {
  const text = String(message || "").trim().slice(0, MAX_CHARS);
  if (!text) { yield { type: "error", message: "empty" }; return; }
  if (!env.ANTHROPIC_API_KEY) { yield { type: "error", message: "not_configured" }; return; }

  // ---- limits ----
  const ipLimit = Number(env.IP_LIMIT_PER_15MIN || (tenant.demo ? 30 : 90));
  const ipHit = await hit(env, `ip:${ip}`, 900, ipLimit);
  if (!ipHit.allowed) { yield { type: "notice", text: "You've sent a lot of messages in a short time — give it a few minutes and try again." }; return; }
  if (tenant.demo) {
    const cap = Number(env.DEMO_DAILY_CAP || 600);
    const day = await hit(env, "demo:daily", 86400, cap);
    if (!day.allowed) { yield { type: "notice", text: "The live demos are resting for today. Book an audit and we'll show you one built for your business." }; return; }
    if ((conversation.turns || 0) >= DEMO_MAX_TURNS) {
      yield { type: "notice", text: "That's the end of this demo session — start a new one, or book an audit to see an agent built for your business." };
      return;
    }
  }

  // ---- context ----
  const docs = await retrieve(env, tenant.id, text, 4);
  const system = buildSystem(tenant, docs, channel);
  const history = trimHistory(conversation.messages || []);
  const messages = [...history, { role: "user", content: text }];

  const ctx = { tenant, conversationId: conversation.id, channel };
  let finalMessages = messages;
  let sawDone = false;

  for await (const evt of runModel({
    env, system, messages, tools: TOOL_DEFS,
    onTool: (name, input) => runTool(env, ctx, name, input),
    maxTokens: channel === "sms" ? 220 : 400,
  })) {
    if (evt.type === "done") { finalMessages = evt.messages; sawDone = true; }
    yield evt;
  }

  if (sawDone) {
    conversation.messages = finalMessages;
    conversation.turns = (conversation.turns || 0) + 1;
    await saveConversation(env, conversation);
  }
}

export function newConversation(tenant, channel, externalId = null) {
  return { id: id("cv"), tenant_id: tenant.id, channel, external_id: externalId, messages: [], turns: 0 };
}

function buildSystem(tenant, docs, channel) {
  const hours = Object.entries(tenant.hours || {}).map(([d, h]) => `${d}: ${h ? `${h[0]}–${h[1]}` : "closed"}`).join(", ");
  const services = (tenant.services || []).map((s) => `${s.name} — ${s.minutes} min${s.price ? `, $${s.price}` : ""}${s.note ? ` (${s.note})` : ""}`).join("\n");
  const knowledge = docs.length ? docs.map((d) => `### ${d.title}\n${d.content}`).join("\n\n") : "(no matching notes — if the question needs facts you don't have, say so and offer a callback)";

  return [
    tenant.persona,
    "",
    `## Business facts`,
    `Business: ${tenant.name}. Timezone: ${tenant.timezone}. Current date/time: ${nowDescription(tenant.timezone)}.`,
    `Hours: ${hours}.`,
    services ? `Services:\n${services}` : "",
    "",
    `## Knowledge (retrieved for this message)`,
    knowledge,
    "",
    `## Escalation rules`,
    tenant.escalation || "Escalate when the customer asks for a person or the request is outside what you know.",
    "",
    `## How to work`,
    `- Use check_availability before offering times; use book_appointment only after the customer confirms a time and gives name and phone.`,
    `- Never invent prices, policies, or availability. Everything you state must come from the facts and knowledge above or a tool result.`,
    `- One question at a time. Keep replies short: ${channel === "sms" ? "SMS — under 300 characters, no markdown" : "2–4 sentences, plain text, no markdown headers or bullet lists"}.`,
    `- Interpret relative dates ("tomorrow", "next Tuesday") against the current date above and convert to YYYY-MM-DD when calling tools.`,
    tenant.demo ? `- This is a live demo built by Mesa Intelligence for a fictional business. If asked whether you're a bot or whether the business is real, say so plainly in one sentence, then carry on helping.` : `- If asked, you are an AI assistant for ${tenant.name}; be upfront about it.`,
  ].filter((l) => l !== null && l !== undefined).join("\n");
}

// Keep the tail of the history, cutting only at a plain user message so
// tool_use / tool_result pairs are never separated.
function trimHistory(messages) {
  if (messages.length <= HISTORY_MESSAGES) return messages;
  let start = messages.length - HISTORY_MESSAGES;
  while (start < messages.length && !(messages[start].role === "user" && typeof messages[start].content === "string")) start++;
  return messages.slice(start);
}

// Plain transcript (for "send with my audit request" and admin views).
export function transcript(messages) {
  const out = [];
  for (const m of messages || []) {
    if (m.role === "user" && typeof m.content === "string") out.push(`Customer: ${m.content}`);
    else if (m.role === "assistant") {
      for (const b of Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content) }]) {
        if (b.type === "text" && b.text.trim()) out.push(`Agent: ${b.text.trim()}`);
        else if (b.type === "tool_use") out.push(`[action: ${b.name} ${JSON.stringify(b.input)}]`);
      }
    }
  }
  return out.join("\n");
}
