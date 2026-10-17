import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mountain, ArrowUpRight } from "lucide-react";

const links = [
  { label: "Services", href: "#services", testid: "nav-services-link" },
  { label: "Live Demo", href: "#demo", testid: "nav-demo-link" },
  { label: "Free Audit", href: "#audit", testid: "nav-audit-link" },
  { label: "Process", href: "#process", testid: "nav-process-link" },
  { label: "Contact", href: "#contact", testid: "nav-contact-link" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-500 ${
        scrolled ? "bg-[#0B0C0E]/80 backdrop-blur-xl border-white/10" : "bg-transparent border-transparent"
      }`}
    >
      <div className="px-6 sm:px-12 lg:px-20 py-4 flex items-center justify-between">
        <a href="#top" data-testid="nav-logo-link" className="flex items-center gap-2.5 group">
          <Mountain className="w-5 h-5 text-[#D96B43] transition-transform duration-500 group-hover:rotate-12" strokeWidth={1.5} />
          <span className="font-display font-medium tracking-tight text-lg">Mesa Intelligence</span>
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.label} href={l.href} data-testid={l.testid}
               className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C] transition-colors duration-300">
              {l.label}
            </a>
          ))}
        </nav>
        <a href="#contact" data-testid="nav-book-audit-button"
              className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] border border-white/15 px-4 py-2 hover:border-[#D96B43] hover:text-[#D96B43] transition-colors duration-300">
          Book an Audit <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.header>
  );
}
