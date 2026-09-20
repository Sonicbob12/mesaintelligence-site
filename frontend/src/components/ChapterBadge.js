import { motion } from "framer-motion";

export default function ChapterBadge({ number, title }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-4 mb-6"
    >
      <span className="font-mono text-xs text-[#D96B43]">{number}</span>
      <span className="h-px w-12 bg-[#D96B43]/40" />
      <span className="eyebrow">{title}</span>
    </motion.div>
  );
}
