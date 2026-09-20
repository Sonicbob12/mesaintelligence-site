import { useState, useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import ChapterBadge from "@/components/ChapterBadge";
import { Send, Loader2, Bot } from "lucide-react";

const API = "/api";

const verticals = [
  {
    key: "hvac", label: "HVAC Dispatch", business: "Desert Peak HVAC",
    greeting: "Desert Peak HVAC, this is Mesa — how can I help you today?",
    presets: ["My AC died and it's 110° outside", "Do you offer maintenance plans?"],
  },
  {
    key: "restaurant", label: "Restaurant Host", business: "Juniper & Vine",
    greeting: "Good evening, Juniper & Vine — how may I seat you?",
    presets: ["Table for two this Friday at 7?", "Do you have vegan options?"],
  },
  {
    key: "dental", label: "Dental Intake", business: "Red Rock Dental",
    greeting: "Thanks for calling Red Rock Dental — what can I do for you?",
    presets: ["I need to book a cleaning", "Do you take Delta Dental?"],
  },
  {
    key: "legal", label: "Legal Intake", business: "Mesa & Grant Legal",
    greeting: "Mesa & Grant Legal, intake desk — tell me briefly what's going on.",
    presets: ["I need help with a lease dispute", "What does a consultation cost?"],
  },
];

export default function AiDemoWidget() {
  const [vertical, setVertical] = useState(verticals[0]);
  const [messages, setMessages] = useState({ hvac: [{ role: "assistant", text: verticals[0].greeting }] });
  const [input, setInput] = useState("");
  const [sessionIds, setSessionIds] = useState({});
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  const msgs = useMemo(() => messages[vertical.key] || [], [messages, vertical.key]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, streaming]);

  const switchVertical = (v) => {
    setVertical(v);
    setMessages((m) => (m[v.key] ? m : { ...m, [v.key]: [{ role: "assistant", text: v.greeting }] }));
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    setInput("");
    const key = vertical.key;
    const sid = sessionIds[key] || crypto.randomUUID();
    setSessionIds((s) => ({ ...s, [key]: sid }));
    setMessages((m) => ({ ...m, [key]: [...(m[key] || []), { role: "user", text: message }, { role: "assistant", text: "" }] }));
    setStreaming(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, vertical: key, message }),
      });
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
          try {
            const { delta } = JSON.parse(payload);
            setMessages((m) => {
              const arr = [...m[key]];
              arr[arr.length - 1] = { role: "assistant", text: arr[arr.length - 1].text + delta };
              return { ...m, [key]: arr };
            });
          } catch {}
        }
      }
    } catch {
      setMessages((m) => {
        const arr = [...m[key]];
        arr[arr.length - 1] = { role: "assistant", text: "Connection hiccup — please try again." };
        return { ...m, [key]: arr };
      });
    }
    setStreaming(false);
  };

  return (
    <section id="demo" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40">
      <ChapterBadge number="03" title="Live Demonstration Hub" />
      <motion.h2
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] max-w-3xl mb-4"
      >
        Don't take our word for it. <span className="font-serif-accent italic text-[#D96B43]">Talk to it.</span>
      </motion.h2>
      <p className="text-[#9E9AA3] font-light max-w-xl mb-12">
        Four sample agents, each built for a fictional local business, running live on Claude. Pick one and try to stump it.
      </p>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="border border-white/10 bg-[#14161A] max-w-4xl"
      >
        <div className="flex flex-wrap border-b border-white/10">
          {verticals.map((v) => (
            <button
              key={v.key}
              onClick={() => switchVertical(v)}
              data-testid={`demo-vertical-selector-${v.key}`}
              className={`font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] px-4 sm:px-6 py-4 border-r border-white/10 transition-colors duration-300 ${
                vertical.key === v.key ? "bg-[#D96B43]/10 text-[#D96B43]" : "text-[#9E9AA3] hover:text-[#F5F3EF]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-4 border-b border-white/8 flex items-center gap-3">
          <Bot className="w-4 h-4 text-[#E5A93C]" strokeWidth={1.5} />
          <span className="font-display font-medium text-sm">{vertical.business}</span>
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8EA89D] animate-pulse-dot" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8EA89D]">Live sample agent</span>
          </span>
        </div>

        <div ref={scrollRef} data-testid="demo-chat-messages-container" className="chat-scroll h-[380px] overflow-y-auto px-6 py-6 space-y-5">
          {msgs.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-5 py-3.5 text-sm sm:text-base font-light leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#D96B43] text-[#0B0C0E]"
                  : "bg-[#0B0C0E] border border-white/10 text-[#F5F3EF]/90"
              }`}>
                {msg.text || (streaming && i === msgs.length - 1 ? <Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> : "")}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-white/8 flex flex-wrap gap-2">
          {vertical.presets.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              data-testid="demo-chat-preset-button"
              disabled={streaming}
              className="font-mono text-[10px] sm:text-[11px] tracking-wide border border-white/12 text-[#9E9AA3] px-3 py-1.5 hover:border-[#E5A93C]/50 hover:text-[#E5A93C] transition-colors duration-300 disabled:opacity-40"
            >
              "{p}"
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex border-t border-white/10"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            data-testid="demo-chat-input-field"
            placeholder={`Message ${vertical.business}...`}
            className="flex-1 bg-transparent px-6 py-5 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none"
          />
          <button
            type="submit"
            data-testid="demo-chat-send-button"
            disabled={streaming || !input.trim()}
            className="px-6 sm:px-8 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors duration-300 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </motion.div>
    </section>
  );
}
