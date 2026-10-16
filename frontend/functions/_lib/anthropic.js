// Streaming Anthropic client with a tool-use loop.
//
// runModel() is an async generator. It yields UI events as they happen:
//   { type: "delta", text }                   streamed assistant text
//   { type: "tool", name, summary, data }     a tool ran (shown as a chip)
//   { type: "done", stop_reason, messages }   final; `messages` is the updated history
//   { type: "error", message }
//
// Tool handling: when a turn stops with tool_use, we execute every requested
// tool, append the assistant content + tool_result user message, and stream
// the next turn. Capped at MAX_TOOL_ROUNDS so a confused model can't loop.

const MAX_TOOL_ROUNDS = 4;
const DEFAULT_MODELS = ["claude-sonnet-4-5", "claude-sonnet-4-20250514", "claude-3-7-sonnet-latest"];

export async function* runModel({ env, system, messages, tools, onTool, maxTokens = 400 }) {
  const history = messages.slice();
  const candidates = [env.ANTHROPIC_MODEL, ...DEFAULT_MODELS].filter(Boolean);

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const upstream = await openStream(env, candidates, { system, messages: history, tools, maxTokens });
    if (!upstream) { yield { type: "error", message: "model_unavailable" }; return; }

    // Accumulate this turn's content blocks while streaming text to the client.
    const blocks = [];
    let stopReason = null;
    let current = null; // { type, text | (id,name,json) }

    for await (const evt of sseEvents(upstream.body)) {
      switch (evt.type) {
        case "content_block_start":
          current = evt.content_block.type === "tool_use"
            ? { type: "tool_use", id: evt.content_block.id, name: evt.content_block.name, json: "" }
            : { type: "text", text: "" };
          break;
        case "content_block_delta":
          if (!current) break;
          if (evt.delta.type === "text_delta") { current.text += evt.delta.text; yield { type: "delta", text: evt.delta.text }; }
          else if (evt.delta.type === "input_json_delta") current.json += evt.delta.partial_json;
          break;
        case "content_block_stop":
          if (current) {
            if (current.type === "tool_use") {
              let input = {};
              try { input = current.json ? JSON.parse(current.json) : {}; } catch { input = {}; }
              blocks.push({ type: "tool_use", id: current.id, name: current.name, input });
            } else if (current.text) blocks.push({ type: "text", text: current.text });
          }
          current = null;
          break;
        case "message_delta":
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          break;
        case "error":
          console.error("anthropic stream error", JSON.stringify(evt.error || evt));
          break;
        default:
          break;
      }
    }

    if (blocks.length) history.push({ role: "assistant", content: blocks });
    const toolUses = blocks.filter((b) => b.type === "tool_use");

    if (stopReason !== "tool_use" || !toolUses.length) {
      if (!blocks.length) history.push({ role: "assistant", content: [{ type: "text", text: "(no reply)" }] });
      yield { type: "done", stop_reason: stopReason || "end_turn", messages: history };
      return;
    }

    const results = [];
    for (const tu of toolUses) {
      const out = await onTool(tu.name, tu.input || {});
      if (out?.event) yield { type: "tool", ...out.event };
      results.push({ type: "tool_result", tool_use_id: tu.id, content: String(out?.result ?? "ok") });
    }
    history.push({ role: "user", content: results });
    // If the last round still wants tools, we fall out of the loop below.
  }

  yield { type: "delta", text: " I've hit my limit for actions in one reply — a team member can pick this up from here." };
  yield { type: "done", stop_reason: "max_tool_rounds", messages: history };
}

async function openStream(env, candidates, { system, messages, tools, maxTokens }) {
  for (const model of candidates) {
    const res = await fetch(`${env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        ...(env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": env.ANTHROPIC_WORKSPACE_ID } : {}),
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools, stream: true }),
    });
    if (res.ok && res.body) return res;
    const errText = await res.text().catch(() => "");
    console.error(`Anthropic error model=${model} status=${res.status} body=${errText.slice(0, 300)}`);
    if (res.status !== 404 && !/not_found|model/i.test(errText)) return null; // only retry on unknown-model errors
  }
  return null;
}

async function* sseEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try { yield JSON.parse(line.slice(6)); } catch { /* ignore */ }
    }
  }
}

// Non-streaming convenience (SMS, tests): collects text and tool events.
export async function runModelCollect(args) {
  let text = "";
  const events = [];
  let messages = args.messages;
  for await (const e of runModel(args)) {
    if (e.type === "delta") text += e.text;
    else if (e.type === "tool") events.push(e);
    else if (e.type === "done") messages = e.messages;
    else if (e.type === "error") throw new Error(e.message);
  }
  return { text: text.trim(), events, messages };
}
