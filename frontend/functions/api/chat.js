// POST /api/chat  — streams a sample-agent reply from Claude as server-sent events.
// Env vars (set in Cloudflare Pages → Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (secret)
//   ANTHROPIC_MODEL    (optional, defaults below)
//   ANTHROPIC_WORKSPACE_ID (required only for organization-scoped keys)

const SYSTEM_PROMPTS = {
  hvac: "You are the AI dispatch assistant for Desert Peak HVAC, a fictional family-run heating and cooling company used as a demo. Answer as their front desk would: triage emergencies, quote service windows (Mon-Sat 7am-7pm, emergency fee $89 after hours), and offer maintenance plans ($18/mo). Be warm, concise (2-4 sentences), and always try to book the job. End with a question that moves toward scheduling. If asked, say plainly that this is a demo agent built by Mesa Intelligence.",
  restaurant: "You are the host AI for Juniper & Vine, a fictional farm-to-table bistro used as a demo. Handle reservations (party size, date, time), menu questions (seasonal, vegan and gluten-free options available), and private events. Be charming and concise (2-4 sentences), and always confirm details like a real host would. If asked, say plainly that this is a demo agent built by Mesa Intelligence.",
  dental: "You are the patient intake assistant for Red Rock Dental, a fictional dental practice used as a demo. Help book cleanings and appointments (Mon-Fri 8am-5pm), answer insurance questions (Delta Dental, Cigna, MetLife accepted), and calm anxious patients. Be reassuring and concise (2-4 sentences), steering toward a booked visit. If asked, say plainly that this is a demo agent built by Mesa Intelligence.",
  legal: "You are the intake assistant for Mesa & Grant Legal, a fictional small-business law firm used as a demo. Screen inquiries (contract review, lease disputes, entity formation), explain the free 20-minute consultation, and note that you are not providing legal advice. Be professional and concise (2-4 sentences), steering toward booking a consultation. If asked, say plainly that this is a demo agent built by Mesa Intelligence.",
};

const MAX_TURNS = 12;      // per session, keeps demo cost bounded
const MAX_CHARS = 600;     // per user message

// Tiny in-memory history keyed by session (per isolate; good enough for a demo)
const histories = new Map();

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ detail: "Bad JSON" }, 400); }
  const { session_id, vertical, message } = body || {};
  if (!SYSTEM_PROMPTS[vertical]) return json({ detail: "Unknown vertical" }, 400);
  const text = String(message || "").trim().slice(0, MAX_CHARS);
  if (!text) return json({ detail: "Empty message" }, 400);
  if (!env.ANTHROPIC_API_KEY) return json({ detail: "Demo not configured" }, 503);

  const key = `${vertical}:${session_id || "anon"}`;
  const history = histories.get(key) || [];
  if (history.length / 2 >= MAX_TURNS) {
    return new Response(sse({ delta: "That's the end of this demo session — refresh the page to start another, or book an audit to see one built for your business." }) + "data: [DONE]\n\n",
      { headers: sseHeaders() });
  }
  const messages = [...history, { role: "user", content: text }];

  const candidates = [env.ANTHROPIC_MODEL, "claude-sonnet-4-5", "claude-sonnet-4-20250514", "claude-3-7-sonnet-latest"].filter(Boolean);
  let upstream = null;
  for (const model of candidates) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        ...(env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : {}),
      },
      body: JSON.stringify({ model, max_tokens: 300, system: SYSTEM_PROMPTS[vertical], messages, stream: true }),
    });
    if (res.ok && res.body) { upstream = res; break; }
    const errText = await res.text().catch(() => "");
    console.error(`Anthropic error model=${model} status=${res.status} body=${errText.slice(0, 300)}`);
    if (res.status !== 404 && !/not_found|model/i.test(errText)) break; // only retry on unknown-model errors
  }

  if (!upstream) {
    const fallback = "Our demo agent is catching its breath — please try again in a moment.";
    return new Response(sse({ delta: fallback }) + "data: [DONE]\n\n", { headers: sseHeaders() });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let evt;
            try { evt = JSON.parse(line.slice(6)); } catch { continue; }
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              full += evt.delta.text;
              controller.enqueue(encoder.encode(sse({ delta: evt.delta.text })));
            }
          }
        }
      } catch (e) {
        if (!full) controller.enqueue(encoder.encode(sse({ delta: "Connection hiccup — please try again." })));
      }
      histories.set(key, [...messages, { role: "assistant", content: full || "(no reply)" }]);
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders() {
  return {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "x-accel-buffering": "no",
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
