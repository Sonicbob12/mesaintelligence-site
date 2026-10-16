// Client for POST /api/chat (SSE). Calls `onEvent` for each event:
//   meta | delta | tool | notice | error | done
export async function sendMessage({ tenant, conversationId, message, onEvent, signal, api = "/api" }) {
  const res = await fetch(`${api}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant, conversation_id: conversationId || undefined, message }),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = "Connection hiccup — please try again.";
    try { detail = (await res.json()).detail || detail; } catch {}
    onEvent({ type: "error", message: detail });
    onEvent({ type: "done" });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const payload = part.slice(6);
      if (payload === "[DONE]") continue;
      try { onEvent(JSON.parse(payload)); } catch {}
    }
  }
}

export async function fetchTenants(api = "/api") {
  const res = await fetch(`${api}/tenants`);
  if (!res.ok) throw new Error("tenants");
  return res.json();
}

export async function fetchTenant(id, api = "/api") {
  const res = await fetch(`${api}/tenants?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("tenant");
  return res.json();
}

// Plain-text transcript of the UI message list (for "send with my audit request").
export function transcriptOf(messages, businessName) {
  return messages.map((m) => {
    if (m.role === "user") return `Me: ${m.text}`;
    if (m.role === "tool") return `[${m.summary}]`;
    return `${businessName || "Agent"}: ${m.text}`;
  }).join("\n");
}
