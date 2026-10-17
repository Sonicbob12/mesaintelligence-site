import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, CalendarPlus, Table2, Mail, BellRing, Check, X, Minus, Loader2, ArrowUp } from "lucide-react";
import ChapterBadge from "@/components/ChapterBadge";

// Workflow Intelligence: shows the post-conversation chain running for the visitor's own demo
// conversation. Listens for the chat widget's events (mesa:conversation / mesa:workflow), then polls
// /api/workflow/runs for that conversation.

const ICONS = { sms: MessageSquare, calendar: CalendarPlus, sheet: Table2, owner: Mail, reminder: BellRing };
const CHAIN = [
  { key: "sms", label: "Confirmation text to the customer", blurb: "Name, time, confirmation code — from the business's own number." },
  { key: "calendar", label: "Event on the business calendar", blurb: "Google Calendar, with the customer's details in the notes." },
  { key: "sheet", label: "Row in the CRM sheet", blurb: "Every booking, lead and hand-off lands in a spreadsheet the owner already uses." },
  { key: "owner", label: "Owner notified", blurb: "Email now; a daily digest at closing time." },
  { key: "reminder", label: "Day-before reminder scheduled", blurb: "Cuts no-shows. Sent automatically the day before." },
];
const fmtT = (s) => (s ? new Date(s * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "");

export default function WorkflowDemo() {
  const [conv, setConv] = useState(null);
  const [run, setRun] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const timer = useRef(null);

  const poll = useCallback(async (id, tries = 0) => {
    try {
      const r = await fetch(`/api/workflow/runs?conversation=${encodeURIComponent(id)}`);
      const d = await r.json();
      const latest = d.runs?.[0] || null;
      if (latest) { setRun(latest); setWaiting(false); }
      const unfinished = !latest || latest.status === "running";
      if (unfinished && tries < 20) timer.current = setTimeout(() => poll(id, tries + 1), 1500);
      else if (!latest) setWaiting(false);
    } catch { setWaiting(false); }
  }, []);

  useEffect(() => {
    const onConv = (e) => { setConv(e.detail); };
    const onWf = () => { setWaiting(true); clearTimeout(timer.current); };
    window.addEventListener("mesa:conversation", onConv);
    window.addEventListener("mesa:workflow", onWf);
    return () => { window.removeEventListener("mesa:conversation", onConv); window.removeEventListener("mesa:workflow", onWf); clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!waiting || !conv?.id) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => poll(conv.id), 800);
    return () => clearTimeout(timer.current);
  }, [waiting, conv, poll]);

  const stepFor = (key) => run?.steps?.find((s) => s.key === key);

  return (
    <section id="workflow" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40 border-t border-white/8 bg-[#0D0E11]">
      <ChapterBadge number="06" title="Workflow Intelligence" />
      <motion.h2
        initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] max-w-3xl mb-4"
      >
        What happens <span className="font-serif-accent italic text-[#D96B43]">after</span> the conversation.
      </motion.h2>
      <p className="text-[#9E9AA3] font-light max-w-xl mb-12">
        A booking is only useful if it lands in the calendar, the customer gets a confirmation, and the owner knows. That all happens on its own — watch it run.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-5xl">
        <div className="lg:col-span-7 border border-white/10 bg-[#14161A] p-8" data-testid="workflow-panel">
          <div className="flex items-center gap-3 mb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">
              {run ? `Chain · ${run.trigger} · ${run.status === "running" ? "running" : run.status === "partial" ? "finished with issues" : "finished"}` : "Live chain"}
            </div>
            {waiting && !run && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D96B43]" />}
          </div>

          {!run && (
            <div className="text-sm text-[#9E9AA3] font-light space-y-3" data-testid="workflow-idle">
              <p className="flex items-center gap-2"><ArrowUp className="w-4 h-4 text-[#D96B43]" /> Book an appointment or leave a callback number in the <a href="#demo" className="text-[#E5A93C] hover:underline">demo chat</a> above.</p>
              <p>The moment the agent books it, each step below lights up with what actually happened, in real time.</p>
            </div>
          )}

          <ol className="divide-y divide-white/8">
            {CHAIN.map((c) => {
              const st = stepFor(c.key);
              const Icon = ICONS[c.key];
              const status = st?.status || (run && !st ? "n/a" : "idle");
              const Mark = status === "done" ? Check : status === "failed" ? X : status === "skipped" || status === "n/a" ? Minus : null;
              const color = status === "done" ? "#8EA89D" : status === "failed" ? "#D96B43" : status === "skipped" ? "#E5A93C" : "#9E9AA3";
              return (
                <li key={c.key} className="py-4 flex gap-4" data-testid="workflow-step" data-status={status}>
                  <div className="w-8 h-8 shrink-0 border border-white/10 flex items-center justify-center" style={{ borderColor: status === "idle" ? undefined : color }}>
                    {status === "running" ? <Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> : Mark ? <Mark className="w-4 h-4" style={{ color }} strokeWidth={2} /> : <Icon className="w-4 h-4 text-[#9E9AA3]" strokeWidth={1.5} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className={`font-light ${status === "idle" ? "text-[#F5F3EF]/80" : ""}`}>{c.label}</span>
                      {st?.at && <span className="font-mono text-[10px] text-[#9E9AA3]">{fmtT(st.at)}{st.ms != null ? ` · ${(st.ms / 1000).toFixed(1)}s` : ""}</span>}
                    </div>
                    <p className="text-sm text-[#9E9AA3] mt-0.5 break-words">{st?.detail || c.blurb}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="border border-white/10 bg-[#14161A] p-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-4">Why it matters</div>
            <ul className="space-y-3 text-sm font-light text-[#F5F3EF]/90">
              <li><span className="text-[#E5A93C]">No double entry.</span> The booking the agent makes is the booking on your calendar and in your CRM.</li>
              <li><span className="text-[#E5A93C]">Fewer no-shows.</span> Confirmation now, reminder the day before — automatically.</li>
              <li><span className="text-[#E5A93C]">Nothing slips.</span> Hand-offs and leads reach a human within minutes, and a digest closes out the day.</li>
            </ul>
          </div>
          <div className="border border-white/10 bg-[#14161A] p-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-4">Works with</div>
            <p className="text-sm font-light text-[#9E9AA3]">Google Calendar and Sheets, Twilio texting, email — and, through n8n or Zapier, most CRMs, invoicing and field-service tools you already pay for.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
