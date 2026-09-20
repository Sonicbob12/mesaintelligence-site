import { motion } from "framer-motion";
import ChapterBadge from "@/components/ChapterBadge";
import { MessageSquareText, PhoneCall, Workflow, MapPin } from "lucide-react";

const services = [
  {
    icon: MessageSquareText,
    title: "Conversational Agents",
    desc: "Custom chat and web agents trained on your menu, your services, your voice. They answer like your best employee — at 2pm or 2am.",
    metric: "Chat, web, and SMS — trained on your business",
    span: "lg:col-span-7",
  },
  {
    icon: PhoneCall,
    title: "Smart Call Dispatch",
    desc: "AI voice agents that answer every call, triage emergencies, and book jobs straight into your calendar.",
    metric: "Answers 24/7, escalates to a human when it should",
    span: "lg:col-span-5",
  },
  {
    icon: Workflow,
    title: "Workflow Intelligence",
    desc: "We wire AI into the tools you already run — CRM, scheduling, invoicing — so follow-ups, reminders, and paperwork happen on their own.",
    metric: "Works with the software you already pay for",
    span: "lg:col-span-5",
  },
  {
    icon: MapPin,
    title: "Local Discovery",
    desc: "AI-assisted local SEO and review response that keeps you at the top of the map when neighbors search.",
    metric: "Google Business Profile, reviews, and local search",
    span: "lg:col-span-7",
  },
];

export default function ServicesSection() {
  return (
    <section id="services" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40">
      <ChapterBadge number="01" title="Service Blueprint" />
      <motion.h2
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.02] max-w-3xl mb-16"
      >
        Four systems. <span className="font-serif-accent italic text-[#D96B43]">One</span> quieter inbox.
      </motion.h2>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {services.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            data-testid={`service-card-${i}`}
            className={`group relative border border-white/10 bg-[#14161A] p-8 sm:p-10 hover:-translate-y-1 hover:border-[#E5A93C]/40 transition-all duration-300 ease-out ${s.span}`}
          >
            <s.icon className="w-7 h-7 text-[#D96B43] mb-8" strokeWidth={1.25} />
            <h3 className="font-display text-xl sm:text-2xl font-medium tracking-tight mb-4">{s.title}</h3>
            <p className="text-[#9E9AA3] font-light leading-relaxed mb-8 max-w-lg">{s.desc}</p>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#E5A93C]/90 border-t border-white/8 pt-5">
              {s.metric}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
