import { useEffect } from "react";
import Lenis from "lenis";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import EditorialMarquee from "@/components/EditorialMarquee";
import ServicesSection from "@/components/ServicesSection";
import IndustriesSection from "@/components/IndustriesSection";
import AiDemoWidget from "@/components/AiDemoWidget";
import ProcessSection from "@/components/ProcessSection";
import FaqSection from "@/components/FaqSection";
import ContactFormSection from "@/components/ContactFormSection";
import Footer from "@/components/Footer";

export default function LandingPage() {
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    let rafId;
    const raf = (time) => { lenis.raf(time); rafId = requestAnimationFrame(raf); };
    rafId = requestAnimationFrame(raf);
    const onAnchor = (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (a) {
        e.preventDefault();
        lenis.scrollTo(a.getAttribute("href"), { offset: -80, duration: 1.4 });
      }
    };
    document.addEventListener("click", onAnchor);
    return () => { cancelAnimationFrame(rafId); lenis.destroy(); document.removeEventListener("click", onAnchor); };
  }, []);

  return (
    <main className="relative bg-[#0B0C0E] text-[#F5F3EF] overflow-x-clip">
      <Navbar />
      <HeroSection />
      <EditorialMarquee />
      <ServicesSection />
      <IndustriesSection />
      <AiDemoWidget />
      <ProcessSection />
      <FaqSection />
      <ContactFormSection />
      <Footer />
    </main>
  );
}
