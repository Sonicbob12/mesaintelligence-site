import { motion } from "framer-motion";
import ChapterBadge from "@/components/ChapterBadge";

const steps = [
  {
    num: "01",
    title: "Audit",
    body: "We spend a few hours inside your operation — the phones, the calendar, the inbox, the software you already pay for — and map exactly where calls, bookings, and follow-ups are falling through.",
    out: "Written scope, fixed price, expected payback",
    span: "lg:col-span-7",
  },
  {
    num: "02",
    title: "Build",
    body: "We build the agent on your own accounts, trained on your services, your prices, and the way you talk to customers. No replatforming, nothing new for staff to learn.",
    out: "Working agent in a private test environment",
    span: "lg:col-span-5",
  },
  {
    num: "03",
    title: "Pilot",
    body: "It goes live on a slice of real traffic — after-hours calls, one location, one phone line. You read the transcripts with us every week and we tune the guardrails until you trust it.",
    out: "Real results on your own numbers",
    span: "lg:col-span-5",
  },
  {
    num: "04",
    title: "Handoff",
    body: "Full rollout, documentation, and a monthly check-in. You own everything: the accounts, the prompts, the data. If we disappeared tomorrow, it keeps running.",
    out: "You own it. We stay on call.",
    span: "lg:col-span-7",
  },
];

export default function ProcessSection() {
  return (
    <section id="process" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 bg-[#0D0E11] border-y border-white/8">
      <ChapterBadge number="04" title="How an Engagement Runs" />
      <motion.h2
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] max-w-3xl mb-16"
      >
        No mystery. <span className="font-serif-accent italic text-[#D96B43]">Four</span> steps.
      </motion.h2>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {steps.map((s, i) => (
          <motion.figure
            key={s.num}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            data-testid={`process-step-${i}`}
            className={`border border-white/10 bg-[#14161A] p-8 sm:p-10 flex flex-col justify-between hover:-translate-y-1 hover:border-[#E5A93C]/40 transition-all duration-300 ${s.span}`}
          >
            <div>
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-xs text-[#D96B43]">{s.num}</span>
                <h3 className="font-display text-3xl sm:text-4xl font-light tracking-tight">{s.title}</h3>
              </div>
              <p className="mt-6 text-[#9E9AA3] font-light leading-relaxed max-w-xl">{s.body}</p>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#E5A93C]/90 border-t border-white/8 pt-5 mt-10">
              {s.out}
            </div>
          </motion.figure>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="mt-16 border border-[#D96B43]/25 bg-[#D96B43]/[0.04] p-8 sm:p-10 max-w-4xl"
      >
        <div className="eyebrow mb-5">A note from the founder</div>
        <p className="font-serif-accent italic text-lg sm:text-xl text-[#F5F3EF]/85 leading-relaxed">
          "I spent two decades estimating and running heavy civil construction projects, and before that I owned a landscaping company. I know what a missed call costs, what a no-show costs, and how little patience a working owner has for software that promises the moon. Mesa Intelligence is the firm I wish I could have hired. We are new, we are local, and our first clients get our full attention and founding-client pricing."
        </p>
        <figcaption className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]/70 mt-5">
          Bobby Lloyd — Founder, Mesa Intelligence LLC · Santa Teresa, New Mexico
        </figcaption>
      </motion.div>
    </section>
  );
}
