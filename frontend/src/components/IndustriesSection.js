import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChapterBadge from "@/components/ChapterBadge";
import { ArrowRight } from "lucide-react";

const industries = [
  {
    key: "hvac", label: "HVAC & Plumbing",
    before: "After-hours calls go to voicemail. Most of those callers book the first competitor who picks up.",
    after: "An AI dispatcher answers in 2 rings, triages the emergency, quotes the callout fee, and books the job.",
    stat: "Illustrative scenario",
    img: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
  },
  {
    key: "restaurant", label: "Dining & Cafes",
    before: "Hosts juggle the phone during Friday rush. Reservations slip, no-shows pile up.",
    after: "The AI host takes bookings, handles dietary questions, and sends reminders so fewer tables sit empty.",
    stat: "Illustrative scenario",
    img: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
  },
  {
    key: "dental", label: "Dental & Clinics",
    before: "Front desk spends 4 hours a day on intake, insurance questions, and reminder calls.",
    after: "Intake AI books cleanings, verifies insurance, and fills cancellation gaps automatically.",
    stat: "Illustrative scenario",
    img: "https://images.unsplash.com/photo-1602128110234-2d11c0aaadfe?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
  },
  {
    key: "legal", label: "Legal & Professional",
    before: "Potential clients email at night and hire whoever replies first in the morning.",
    after: "An intake assistant screens inquiries instantly and books consultations into open slots.",
    stat: "Illustrative scenario",
    img: "https://images.unsplash.com/photo-1570480904701-7ff35e543280?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
  },
];

export default function IndustriesSection() {
  const [active, setActive] = useState(industries[0]);

  return (
    <section id="industries" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 bg-[#0D0E11] border-y border-white/8">
      <ChapterBadge number="02" title="Verticals Served" />
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-14">
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] max-w-2xl"
        >
          Built for the trades, tables, and practices on your street.
        </motion.h2>
        <div className="flex flex-wrap gap-2">
          {industries.map((ind) => (
            <button
              key={ind.key}
              onClick={() => setActive(ind)}
              data-testid={`industry-tab-${ind.key}`}
              className={`font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-2.5 border transition-colors duration-300 ${
                active.key === ind.key
                  ? "border-[#D96B43] text-[#D96B43] bg-[#D96B43]/5"
                  : "border-white/12 text-[#9E9AA3] hover:border-white/30 hover:text-[#F5F3EF]"
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          <div className="lg:col-span-5 relative overflow-hidden border border-white/10 min-h-[320px]">
            <img src={active.img} alt={active.label} className="absolute inset-0 w-full h-full object-cover opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 font-mono text-[11px] uppercase tracking-[0.2em] text-[#E5A93C] bg-[#0B0C0E]/70 backdrop-blur px-3 py-2 border border-[#E5A93C]/20">
              {active.stat}
            </div>
          </div>
          <div className="lg:col-span-7 grid grid-rows-2 gap-6">
            <div className="border border-white/10 bg-[#14161A] p-8">
              <div className="eyebrow mb-4 !text-[#9E9AA3]">Before Mesa</div>
              <p className="text-[#9E9AA3] font-light leading-relaxed text-base sm:text-lg">{active.before}</p>
            </div>
            <div className="border border-[#D96B43]/25 bg-[#D96B43]/[0.04] p-8">
              <div className="eyebrow mb-4 flex items-center gap-2">After Mesa <ArrowRight className="w-3 h-3" /></div>
              <p className="text-[#F5F3EF]/90 font-light leading-relaxed text-base sm:text-lg">{active.after}</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
