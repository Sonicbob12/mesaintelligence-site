import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import ChapterBadge from "@/components/ChapterBadge";
import AgentChat from "@/components/AgentChat";
import { fetchTenants, transcriptOf } from "@/lib/agentClient";
import { ArrowUpRight } from "lucide-react";

// Shown until /api/tenants answers (and as the fallback if it can't).
const FALLBACK = [
  { id: "desert-peak-hvac", name: "Desert Peak HVAC", vertical: "hvac", demo: true, greeting: "Desert Peak HVAC, this is Mesa — how can I help you today?", presets: ["My AC died and it's 110° outside", "Do you offer maintenance plans?", "Book me a tune-up next week"] },
  { id: "juniper-vine", name: "Juniper & Vine", vertical: "restaurant", demo: true, greeting: "Good evening, Juniper & Vine — how may I seat you?", presets: ["Table for two this Friday at 7?", "Do you have vegan options?", "Can you do a party of 12?"] },
  { id: "red-rock-dental", name: "Red Rock Dental", vertical: "dental", demo: true, greeting: "Thanks for calling Red Rock Dental — what can I do for you?", presets: ["I need to book a cleaning", "Do you take Delta Dental?", "My tooth is killing me"] },
  { id: "mesa-grant-legal", name: "Mesa & Grant Legal", vertical: "legal", demo: true, greeting: "Mesa & Grant Legal, intake desk — tell me briefly what's going on.", presets: ["I need help with a lease dispute", "What does a consultation cost?", "Can you form an LLC for me?"] },
];
const LABELS = { hvac: "HVAC Dispatch", restaurant: "Restaurant Host", dental: "Dental Intake", legal: "Legal Intake" };

export default function AiDemoWidget() {
  const [tenants, setTenants] = useState(FALLBACK);
  const [active, setActive] = useState(FALLBACK[0]);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    fetchTenants().then((list) => {
      const demos = list.filter((t) => t.demo);
      if (demos.length) { setTenants(demos); setActive((a) => demos.find((t) => t.id === a.id) || demos[0]); }
    }).catch(() => {});
  }, []);

  const onMessages = useCallback((m) => setMessages(m), []);
  const hasConversation = messages.some((m) => m.role === "user");

  const sendToAudit = () => {
    const text = transcriptOf(messages, active.name);
    window.dispatchEvent(new CustomEvent("mesa:prefill", {
      detail: { message: `I tried the ${active.name} demo. Here's the conversation — I'd like something like this for my business:\n\n${text}` },
    }));
    document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="demo" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40">
      <ChapterBadge number="03" title="Live Demonstration Hub" />
      <motion.h2
        initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] max-w-3xl mb-4"
      >
        Don't take our word for it. <span className="font-serif-accent italic text-[#D96B43]">Talk to it.</span>
      </motion.h2>
      <p className="text-[#9E9AA3] font-light max-w-xl mb-12">
        Four sample agents, each built for a fictional local business and running live on Claude. They check real availability, book real appointments, and hand off to a human when they should. Try to stump one.
      </p>

      <motion.div
        initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="border border-white/10 bg-[#14161A] max-w-4xl"
      >
        <div className="flex flex-wrap border-b border-white/10">
          {tenants.map((t) => (
            <button key={t.id} onClick={() => setActive(t)} data-testid={`demo-vertical-selector-${t.vertical}`}
                    className={`font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.15em] px-4 sm:px-6 py-4 border-r border-white/10 transition-colors duration-300 ${
                      active.id === t.id ? "bg-[#D96B43]/10 text-[#D96B43]" : "text-[#9E9AA3] hover:text-[#F5F3EF]"}`}>
              {LABELS[t.vertical] || t.name}
            </button>
          ))}
        </div>
        <AgentChat key={active.id} tenant={active} onMessages={onMessages} />
      </motion.div>

      <div className="max-w-4xl mt-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-[#9E9AA3] text-sm font-light flex-1">
          Bookings made here go into a demo calendar — nothing real is scheduled. Each agent runs on the same engine we deploy for clients: your hours, your prices, your rules.
        </p>
        <button type="button" onClick={sendToAudit} disabled={!hasConversation} data-testid="demo-send-transcript-button"
                className="group font-mono text-xs uppercase tracking-[0.2em] px-6 py-3 border border-white/20 hover:border-[#E5A93C] hover:text-[#E5A93C] transition-colors duration-300 disabled:opacity-40 disabled:hover:border-white/20 disabled:hover:text-inherit flex items-center gap-2 whitespace-nowrap">
          Send this chat with my audit request
          <ArrowUpRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>
    </section>
  );
}
