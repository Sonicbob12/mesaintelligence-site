import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import ChapterBadge from "@/components/ChapterBadge";
import { ArrowUpRight, Loader2 } from "lucide-react";

const API = "/api";
const industries = ["HVAC & Plumbing", "Restaurant & Cafe", "Dental & Medical", "Retail", "Legal & Professional", "Other Local Business"];

const inputCls = "w-full bg-transparent border border-white/12 px-5 py-4 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors duration-300";

export default function ContactFormSection() {
  const blank = { name: "", email: "", phone: "", company: "", industry: "", message: "", website: "" };
  const [form, setForm] = useState(blank);
  const [sending, setSending] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch(`${API}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Enquiry dispatched. We'll call you within one business day.");
      setForm(blank);
    } catch {
      toast.error("Something went wrong — please try again.");
    }
    setSending(false);
  };

  return (
    <section id="contact" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40 bg-[#0D0E11] border-t border-white/8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
        <div className="lg:col-span-5">
          <ChapterBadge number="06" title="Consultation Dispatch" />
          <motion.h2
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] mb-8"
          >
            Tell us what's <span className="font-serif-accent italic text-[#D96B43]">slipping.</span>
          </motion.h2>
          <p className="text-[#9E9AA3] font-light leading-relaxed max-w-md">
            Missed calls, slow follow-ups, no-show appointments — whatever's costing you money, describe it below. We'll reply within one business day with a fixed-scope audit proposal.
          </p>
        </div>

        <motion.form
          onSubmit={submit}
          data-testid="contact-form"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5"
        >
          <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <input required value={form.name} onChange={set("name")} data-testid="contact-form-name-input" placeholder="Your name" className={inputCls} />
          <input required type="email" value={form.email} onChange={set("email")} data-testid="contact-form-email-input" placeholder="Email address" className={inputCls} />
          <input value={form.phone} onChange={set("phone")} data-testid="contact-form-phone-input" placeholder="Phone (optional)" className={inputCls} />
          <input required value={form.company} onChange={set("company")} data-testid="contact-form-company-input" placeholder="Business name" className={inputCls} />
          <select required value={form.industry} onChange={set("industry")} data-testid="contact-form-industry-select"
                  className={`${inputCls} sm:col-span-2 appearance-none ${form.industry ? "text-[#F5F3EF]" : "text-[#9E9AA3]/50"}`}>
            <option value="" disabled className="bg-[#14161A]">What kind of business?</option>
            {industries.map((i) => <option key={i} value={i} className="bg-[#14161A] text-[#F5F3EF]">{i}</option>)}
          </select>
          <textarea required value={form.message} onChange={set("message")} data-testid="contact-form-message-textarea"
                    placeholder="What's the biggest operational headache right now?" rows={5}
                    className={`${inputCls} sm:col-span-2 resize-none`} />
          <button
            type="submit"
            data-testid="contact-form-submit-button"
            disabled={sending}
            className="sm:col-span-2 group bg-[#D96B43] text-[#0B0C0E] font-mono text-xs uppercase tracking-[0.2em] px-8 py-5 hover:bg-[#E5A93C] transition-colors duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Dispatch Enquiry <ArrowUpRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" /></>}
          </button>
        </motion.form>
      </div>
    </section>
  );
}
