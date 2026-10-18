import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, Bot, CalendarCheck, CalendarSearch, UserRound, ClipboardList, RotateCcw } from "lucide-react";
import { sendMessage } from "@/lib/agentClient";

const TOOL_ICONS = { book_appointment: CalendarCheck, check_availability: CalendarSearch, escalate_to_human: UserRound, capture_lead: ClipboardList };

/**
 * Shared chat UI for the demo hub and the embeddable widget.
 * props: tenant {id,name,greeting,presets}, compact?: bool, api?: string,
 *        onMessages?: (messages) => void   (lets a parent read the transcript)
 */
export default function AgentChat({ tenant, compact = false, api = "/api", onMessages }) {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [ended, setEnded] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages(tenant?.greeting ? [{ role: "assistant", text: tenant.greeting }] : []);
    setConversationId(null);
    setStreaming(false);
    setEnded(false);
    setInput("");
  }, [tenant]);

  useEffect(() => { reset(); }, [reset]);
  useEffect(() => { onMessages?.(messages); }, [messages, onMessages]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || streaming || ended) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    await sendMessage({
      tenant: tenant.id, conversationId, message, api, signal: controller.signal,
      onEvent: (evt) => {
        switch (evt.type) {
          case "meta":
            if (evt.conversation_id) {
              setConversationId(evt.conversation_id);
              try { window.dispatchEvent(new CustomEvent("mesa:conversation", { detail: { id: evt.conversation_id, tenant: tenant.id } })); } catch {}
            }
            break;
          case "delta":
            setMessages((m) => appendToLastAssistant(m, evt.text));
            break;
          case "tool":
            if (["book_appointment", "capture_lead", "escalate_to_human"].includes(evt.name)) {
              try { window.dispatchEvent(new CustomEvent("mesa:workflow", { detail: { tool: evt.name, summary: evt.summary } })); } catch {}
            }
            setMessages((m) => {
              // Insert the chip before the trailing (still streaming) assistant bubble.
              const arr = [...m];
              const last = arr.pop();
              const chip = { role: "tool", name: evt.name, summary: evt.summary, data: evt.data };
              return last?.role === "assistant" && !last.text ? [...arr, chip, last] : [...arr, last, chip, { role: "assistant", text: "" }];
            });
            break;
          case "notice":
            setMessages((m) => replaceLastAssistant(m, { role: "notice", text: evt.text }));
            setEnded(/end of this demo|resting for today/i.test(evt.text));
            break;
          case "error":
            setMessages((m) => replaceLastAssistant(m, { role: "assistant", text: evt.message || "Connection hiccup — please try again." }));
            break;
          default:
            break;
        }
      },
    }).catch(() => {
      setMessages((m) => replaceLastAssistant(m, { role: "assistant", text: "Connection hiccup — please try again." }));
    });
    // drop an empty trailing bubble if nothing came back
    setMessages((m) => (m.length && m[m.length - 1].role === "assistant" && !m[m.length - 1].text ? m.slice(0, -1) : m));
    setStreaming(false);
  };

  const h = compact ? "h-[min(60vh,440px)]" : "h-[380px]";

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-white/8 flex items-center gap-3">
        <Bot className="w-4 h-4 text-[#E5A93C]" strokeWidth={1.5} />
        <span className="font-display font-medium text-sm">{tenant.name}</span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8EA89D] animate-pulse-dot" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8EA89D]">{tenant.demo ? "Live sample agent" : "AI assistant"}</span>
        </span>
        <button type="button" onClick={reset} title="Start over" aria-label="Start over"
                className="text-[#9E9AA3] hover:text-[#E5A93C] transition-colors">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={scrollRef} data-testid="demo-chat-messages-container" className={`chat-scroll ${h} overflow-y-auto px-5 py-5 space-y-4`}>
        {messages.map((msg, i) => <Bubble key={i} msg={msg} pending={streaming && i === messages.length - 1} />)}
      </div>

      {tenant.presets?.length > 0 && messages.length <= 1 && (
        <div className="px-5 py-3 border-t border-white/8 flex flex-wrap gap-2">
          {tenant.presets.map((p) => (
            <button key={p} onClick={() => send(p)} data-testid="demo-chat-preset-button" disabled={streaming || ended}
                    className="font-mono text-[10px] sm:text-[11px] tracking-wide border border-white/12 text-[#9E9AA3] px-3 py-1.5 hover:border-[#E5A93C]/50 hover:text-[#E5A93C] transition-colors duration-300 disabled:opacity-40">
              "{p}"
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex border-t border-white/10">
        <input value={input} onChange={(e) => setInput(e.target.value)} data-testid="demo-chat-input-field"
               placeholder={ended ? "Session ended — start over to continue" : `Message ${tenant.name}...`} disabled={ended} maxLength={600}
               className="flex-1 bg-transparent px-5 py-4 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none disabled:opacity-50" />
        <button type="submit" data-testid="demo-chat-send-button" disabled={streaming || ended || !input.trim()} aria-label="Send"
                className="px-6 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors duration-300 disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </form>
      <p className="px-5 py-2 text-[10px] leading-snug text-[#9E9AA3]/70 border-t border-white/8" data-testid="sms-consent">
        If you give a mobile number, {tenant.name} may text you about your appointment or request (confirmations, reminders, replies). Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.
        {" "}<a href="/sms" className="underline hover:text-[#E5A93C]">SMS terms</a> · <a href="/privacy" className="underline hover:text-[#E5A93C]">Privacy</a> · <a href="/terms" className="underline hover:text-[#E5A93C]">Terms</a>
      </p>
    </div>
  );
}

function Bubble({ msg, pending }) {
  if (msg.role === "tool") {
    const Icon = TOOL_ICONS[msg.name] || ClipboardList;
    const strong = msg.name === "book_appointment" || msg.name === "escalate_to_human";
    return (
      <div className="flex justify-start" data-testid="demo-chat-tool-chip">
        <div className={`flex items-center gap-2 px-3 py-2 text-[11px] font-mono tracking-wide border ${strong ? "border-[#8EA89D]/50 text-[#8EA89D] bg-[#8EA89D]/5" : "border-white/10 text-[#9E9AA3]"}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>{msg.summary}</span>
        </div>
      </div>
    );
  }
  if (msg.role === "notice") {
    return <div className="text-center text-[11px] font-mono text-[#9E9AA3] px-6 py-2">{msg.text}</div>;
  }
  const user = msg.role === "user";
  return (
    <div className={`flex ${user ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] px-4 py-3 text-sm sm:text-[15px] font-light leading-relaxed whitespace-pre-wrap ${
        user ? "bg-[#D96B43] text-[#0B0C0E]" : "bg-[#0B0C0E] border border-white/10 text-[#F5F3EF]/90"}`}>
        {msg.text ? plain(msg.text) : (pending ? <Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> : "")}
      </div>
    </div>
  );
}

// The agent is told not to use markdown; strip the odd **bold** / *italic* that slips through.
const plain = (t) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)\*(\S[^*]*\S)\*(?=\s|$)/g, "$1$2");

function appendToLastAssistant(m, text) {
  const arr = [...m];
  const i = arr.length - 1;
  if (i >= 0 && arr[i].role === "assistant") arr[i] = { ...arr[i], text: arr[i].text + text };
  else arr.push({ role: "assistant", text });
  return arr;
}

function replaceLastAssistant(m, replacement) {
  const arr = [...m];
  const i = arr.length - 1;
  if (i >= 0 && arr[i].role === "assistant" && !arr[i].text) arr[i] = replacement;
  else arr.push(replacement);
  return arr;
}
