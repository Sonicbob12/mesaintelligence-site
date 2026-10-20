import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// The subscription upsell shown on every audit report page. Starts Stripe Checkout (subscription).
const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const ghost = "font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 border border-white/15 hover:border-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const FEATURES = [
  "Monthly re-audit of your listing, website and search rank — with a 'what changed' email",
  "One-tap review requests to customers after every job",
  "A 24/7 chat agent on your website that answers, books and emails you every lead",
  "A voice line that answers after-hours calls and books the job",
  "Your fix-it list worked month by month, with the score to prove it",
];

export default function PlanOffer({ auditId, shareKey, pro, business, outreachId }) {
  const [h, setH] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then(setH).catch(() => {}); }, []);
  if (!h?.plan) return null;
  const go = async (interval) => {
    setBusy(interval); setErr("");
    try {
      const res = await fetch("/api/plan/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: auditId, k: shareKey, interval, o: outreachId || "" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || "Couldn't start checkout.");
      window.location.href = d.url;
    } catch (e) { setErr(e.message); setBusy(""); }
  };
  const monthly = h.plan_price || 249, annual = h.plan_annual || 2388;
  return (
    <section className="mt-10 border border-[#E5A93C]/50 bg-[#E5A93C]/[0.04] p-8 print:hidden" data-testid="plan-offer">
      <div className="grid md:grid-cols-12 gap-8">
        <div className="md:col-span-7">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#E5A93C] mb-2">Local Growth Plan</div>
          <h2 className="font-display text-3xl font-light tracking-tight mb-3">Have this fixed for you — and kept fixed.</h2>
          <p className="text-sm text-[#9E9AA3] font-light mb-4">{business ? `${business} gets` : "You get"} the software and the follow-through, running every month without you touching it:</p>
          <ul className="text-sm font-light space-y-1.5">{FEATURES.map((f) => <li key={f} className="flex gap-2"><span className="text-[#E5A93C]">·</span><span>{f}</span></li>)}</ul>
          {pro && <p className="text-xs text-[#9E9AA3] mt-4">Your $99 Pro report is credited toward the first month.</p>}
        </div>
        <div className="md:col-span-5 flex flex-col justify-center gap-3">
          <div><span className="font-display text-5xl font-light">${monthly}</span><span className="text-sm text-[#9E9AA3]"> / month</span></div>
          <button onClick={() => go("month")} disabled={Boolean(busy)} className={primary} data-testid="plan-monthly">{busy === "month" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Start the plan — monthly</button>
          <button onClick={() => go("year")} disabled={Boolean(busy)} className={ghost} data-testid="plan-annual">{busy === "year" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Pay yearly — ${annual} (${Math.round(annual / 12)}/mo)</button>
          <p className="text-[11px] text-[#9E9AA3]">Cancel any time from your dashboard. Set up in 5 minutes; the voice line is turned on for you within 2 business days. Secure checkout by Stripe. <a href="/plan" className="text-[#E5A93C]">Full details</a>.</p>
          {err && <p className="text-sm text-[#D96B43]">{err}</p>}
        </div>
      </div>
    </section>
  );
}
