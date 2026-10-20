import { motion } from "framer-motion";
import ChapterBadge from "@/components/ChapterBadge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    q: "What does this actually cost?",
    a: "The listing audit is free. The full Pro report is $99, credited toward the plan. The Local Growth Plan — monthly re-audit, 24/7 chat agent, review requests, voice line — is $249 a month or $2,388 a year, cancel any time. Custom builds beyond that get a written scope and fixed price before anything is built. See /plan for details.",
  },
  {
    q: "How long until it's live in my business?",
    a: "On the Local Growth Plan the chat agent and review requests are live within minutes of signing up; the voice line is turned on for you within 2 business days. Custom CRM or calendar integrations take longer because we test them against your real workflow before customers ever touch them.",
  },
  {
    q: "Will my staff need training?",
    a: "Almost none. We plug into the tools you already use — your calendar, your CRM, your phone line. Staff keep working the way they do today; the AI simply handles the work that was falling through the cracks.",
  },
  {
    q: "What happens to my customer data?",
    a: "It stays yours. Agents run on your own business knowledge under your own accounts, and your customers' information is never used to train shared models.",
  },
  {
    q: "What if the AI says something wrong?",
    a: "Every agent operates inside guardrails we tune with you — what it can promise, what it must escalate, and when to hand off to a human. You review real transcripts weekly during the first month.",
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <ChapterBadge number="08" title="Frequent Inquiries" />
          <motion.h2
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02]"
          >
            Questions every owner <span className="font-serif-accent italic text-[#D96B43]">asks first.</span>
          </motion.h2>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7"
        >
          <Accordion type="single" collapsible className="w-full" data-testid="faq-accordion">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-white/10">
                <AccordionTrigger data-testid={`faq-trigger-${i}`} className="font-display text-lg sm:text-xl font-normal text-left hover:text-[#E5A93C] hover:no-underline py-6 transition-colors">
                  <span className="font-mono text-xs text-[#D96B43] mr-4">0{i + 1}</span>{f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[#9E9AA3] font-light leading-relaxed pl-10 pb-6">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
