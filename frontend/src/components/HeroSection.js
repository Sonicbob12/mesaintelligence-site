import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowDown, Radio } from "lucide-react";

const lines = [
  { text: "YOUR BUSINESS,", cls: "text-[#F5F3EF]" },
  { text: "NOW THINKS", cls: "text-[#D96B43] font-serif-accent italic font-light" },
  { text: "FOR ITSELF.", cls: "text-[#F5F3EF]" },
];

export default function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBg = useTransform(scrollYProgress, [0, 1], [0, 180]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} id="top" className="relative min-h-screen flex flex-col justify-center grain overflow-hidden">
      <motion.div style={{ y: yBg }} className="absolute inset-0 beam" />
      <motion.div style={{ y: yBg }} className="absolute right-[-10%] top-[10%] w-[46rem] h-[46rem] rounded-full border border-white/5 pointer-events-none" />
      <motion.div style={{ y: yBg }} className="absolute right-[2%] top-[24%] w-[28rem] h-[28rem] rounded-full border border-[#D96B43]/15 pointer-events-none" />

      <motion.div style={{ opacity }} className="relative px-6 sm:px-12 lg:px-20 pt-32 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="flex items-center gap-3 mb-10"
        >
          <span className="flex items-center gap-2 border border-[#D96B43]/30 bg-[#D96B43]/5 px-3 py-1.5">
            <Radio className="w-3 h-3 text-[#D96B43] animate-pulse-dot" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#D96B43]">Now booking founding clients</span>
          </span>
          <span className="eyebrow hidden sm:block">Mesa Intelligence — AI for Local Business</span>
        </motion.div>

        <h1 data-testid="hero-headline-text" className="font-display font-light tracking-tight leading-[0.95] text-5xl sm:text-7xl lg:text-[7.5rem]">
          {lines.map((line, i) => (
            <span key={line.text} className="block overflow-hidden pb-1">
              <motion.span
                className={`block ${line.cls}`}
                initial={{ y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 + i * 0.14 }}
              >
                {line.text}
              </motion.span>
            </span>
          ))}
        </h1>

        <div className="mt-12 flex flex-col lg:flex-row lg:items-end gap-10 lg:gap-24">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.0 }}
            className="max-w-md text-base sm:text-lg text-[#9E9AA3] leading-relaxed font-light"
          >
            We build practical AI agents for the businesses that built this valley — answering the calls, booking the jobs, and catching the leads that slip after hours.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.15 }}
            className="flex flex-wrap gap-4"
          >
            <a href="#demo" data-testid="hero-cta-demo-button"
               className="group bg-[#D96B43] text-[#0B0C0E] font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 hover:bg-[#E5A93C] transition-colors duration-300 flex items-center gap-2">
              Test Live Demo
              <ArrowDown className="w-4 h-4 transition-transform duration-300 group-hover:translate-y-1" />
            </a>
            <a href="#contact" data-testid="hero-cta-contact-button"
               className="font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 border border-white/20 hover:border-[#E5A93C] hover:text-[#E5A93C] transition-colors duration-300">
              Book an Audit
            </a>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
        className="absolute bottom-8 left-6 sm:left-12 lg:left-20 font-mono text-[10px] uppercase tracking-[0.3em] text-[#9E9AA3]/60"
      >
        Las Cruces — El Paso — Southern New Mexico
      </motion.div>
    </section>
  );
}
