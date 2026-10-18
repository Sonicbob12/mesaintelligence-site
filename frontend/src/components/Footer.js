import { Mountain } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative px-6 sm:px-12 lg:px-20 pt-24 pb-10 border-t border-white/8 overflow-hidden">
      <div className="flex flex-col lg:flex-row justify-between gap-12 mb-20">
        <div>
          <div className="flex items-center gap-2.5 mb-6">
            <Mountain className="w-5 h-5 text-[#D96B43]" strokeWidth={1.5} />
            <span className="font-display font-medium tracking-tight text-lg">Mesa Intelligence</span>
          </div>
          <p className="text-[#9E9AA3] font-light max-w-sm text-sm leading-relaxed">
            Practical AI integration for local businesses, built by someone who has run one.
          </p>
        </div>
        <div className="flex gap-16">
          <div>
            <div className="eyebrow mb-5">Based in</div>
            <ul className="space-y-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#9E9AA3]">
              <li>Santa Teresa, NM</li>
              <li>Serving Las Cruces, El Paso</li>
              <li>&amp; Southern New Mexico</li>
              <li className="pt-2 normal-case tracking-normal"><a href="mailto:hello@mesaintelligence.ai" className="hover:text-[#E5A93C] transition-colors">hello@mesaintelligence.ai</a></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-5">Navigate</div>
            <ul className="space-y-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#9E9AA3]">
              <li><a href="#services" className="hover:text-[#E5A93C] transition-colors">Services</a></li>
              <li><a href="#demo" className="hover:text-[#E5A93C] transition-colors">Live Demo</a></li>
              <li><a href="#process" className="hover:text-[#E5A93C] transition-colors">Process</a></li>
              <li><a href="#contact" className="hover:text-[#E5A93C] transition-colors">Contact</a></li>
              <li><a href="/privacy" className="hover:text-[#E5A93C] transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="hover:text-[#E5A93C] transition-colors">Terms &amp; Conditions</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="font-display font-light text-stroke leading-none text-[clamp(6rem,22vw,20rem)] tracking-tight select-none pointer-events-none -mb-6 sm:-mb-10">
        MESA
      </div>
      <div className="flex flex-col sm:flex-row justify-between gap-3 pt-8 border-t border-white/8 font-mono text-[10px] uppercase tracking-[0.25em] text-[#9E9AA3]/50">
        <span>© {new Date().getFullYear()} Mesa Intelligence LLC</span>
        <span>AI, made local.</span>
      </div>
    </footer>
  );
}
