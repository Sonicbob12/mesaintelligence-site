import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Check, Mountain } from "lucide-react";

// /plan — the public pricing page for the Local Growth Plan. Buyable without an audit (email → Stripe Checkout).
// Also the natural landing for the nav "Pricing" link, LinkedIn posts and in-person conversations.

const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const ghost = "font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 border border-white/15 hover:border-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const inputCls = "w-full bg-transparent border border-white/12 px-5 py-4 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors";
const label = "font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]";

const TIERS = [
  {
    name: "Free audit", price: "$0", per: "", cta: { label: "Run my free audit", to: "/#audit" },
    blurb: "See where you stand in 15 seconds.",
    items: ["Google listing score", "Website check", "Your rank for \"{your trade} in {your city}\"", "You vs. the 5 businesses next to you", "Top 3 problems"],
  },
  {
    name: "Pro report", price: "$99", per: "one time", cta: { label: "Start with the free audit", to: "/#audit" },
    blurb: "The full picture, with a plan. Credited in full toward the plan.",
    items: ["Everything in the free audit", "Rank for \"near me\" and \"best …\" searches", "Duplicate-listing check", "The #1 competitor's website teardown", "What your reviews say customers love and complain about", "Google PageSpeed mobile scores", "8-step fix-it plan with a 30-day order", "Printable, shareable report page"],
  },
  {
    name: "Local Growth Plan", featured: true, price: "$249", per: "/ month", alt: "or $2,388 / year ($199 / mo)",
    blurb: "Fixed for you — and kept fixed. Runs every month without you touching it.",
    items: ["Everything in the Pro report, re-run monthly with a \"what changed\" email", "24/7 chat agent on your website that answers questions, books, and emails you every lead", "One-tap review requests to customers by text or email after each job", "A voice line that answers after-hours calls, books the job and texts the customer a confirmation", "A text reminder the day before every appointment, so fewer no-shows", "Your fix-it list worked month by month, with the score to prove it", "Private dashboard: hours, services, review link, widget, billing", "Cancel any time"],
  },
];

const FAQ = [
  ["Who is this for?", "Owner-run local businesses — HVAC, plumbers, dentists, law offices, restaurants, salons, auto shops — in Las Cruces, El Paso and anywhere else people search Google before they call."],
  ["What happens after I subscribe?", "Within a minute you get a welcome email with your private dashboard. Five minutes there (hours, services, your Google review link) and the chat agent and review requests are live. The voice line is set up for you within 2 business days."],
  ["Do I need a new website?", "No. The chat agent is one line of code on your existing site, and most listing fixes happen in Google Business Profile. If your site is the problem, the plan tells you exactly what to change — or we quote a rebuild separately."],
  ["Is there a contract?", "No. Month to month, cancel from your dashboard. Yearly is cheaper if you want it."],
  ["What does the $99 Pro report credit mean?", "If you bought the Pro report first, $99 comes off your first plan payment automatically at checkout."],
  ["Who's behind this?", "Bobby Lloyd, Mesa Intelligence LLC, Santa Teresa NM. A construction superintendent, project manager and estimator who also ran his own landscaping company — now building practical AI for local businesses. You'll have my direct email."],
];

export default function PlanPage() {
  const [h, setH] = useState(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then(setH).catch(() => {}); window.scrollTo(0, 0); }, []);
  const monthly = h?.plan_price || 249, annual = h?.plan_annual || 2388;

  const go = async (interval) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("Enter your email to start — your dashboard link goes there."); return; }
    setBusy(interval); setErr("");
    try {
      const res = await fetch("/api/plan/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, interval }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || "Couldn't start checkout.");
      window.location.href = d.url;
    } catch (e) { setErr(e.message); setBusy(""); }
  };

  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF]">
      <header className="px-6 sm:px-12 lg:px-20 py-4 flex items-center justify-between border-b border-white/8">
        <Link to="/" className="flex items-center gap-2.5"><Mountain className="w-5 h-5 text-[#D96B43]" strokeWidth={1.5} /><span className="font-display font-medium tracking-tight text-lg">Mesa Intelligence</span></Link>
        <nav className="hidden sm:flex items-center gap-8">
          <Link to="/#audit" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">Free Audit</Link>
          <Link to="/book" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">Book a Call</Link>
        </nav>
      </header>

      <section className="px-6 sm:px-12 lg:px-20 pt-16 sm:pt-24 pb-10">
        <div className={label + " mb-4"}>Pricing</div>
        <h1 className="font-display text-4xl sm:text-6xl font-light tracking-tight leading-[1.02] max-w-3xl">
          Show up first. <span className="font-serif-accent italic text-[#D96B43]">Answer</span> first. Get the job.
        </h1>
        <p className="text-[#9E9AA3] font-light max-w-xl mt-6">
          Three steps, each one optional. Start free, see your numbers, and only pay when the plan is doing the work for you.
        </p>
      </section>

      <section className="px-6 sm:px-12 lg:px-20 pb-20 grid lg:grid-cols-3 gap-6" data-testid="plan-tiers">
        {TIERS.map((t) => (
          <div key={t.name} className={`p-8 flex flex-col border ${t.featured ? "border-[#E5A93C]/60 bg-[#E5A93C]/[0.04]" : "border-white/10 bg-[#14161A]"}`}>
            <div className={label + (t.featured ? " text-[#E5A93C]" : "")}>{t.name}</div>
            <div className="mt-4 flex items-baseline gap-2"><span className="font-display text-5xl font-light">{t.featured ? `$${monthly}` : t.price}</span><span className="text-sm text-[#9E9AA3]">{t.per}</span></div>
            {t.featured && <div className="text-xs text-[#9E9AA3] mt-1">or ${annual} / year (${Math.round(annual / 12)} / mo)</div>}
            <p className="text-sm font-light mt-4">{t.blurb}</p>
            <ul className="mt-6 space-y-2 text-sm font-light flex-1">
              {t.items.map((i) => <li key={i} className="flex gap-2"><Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: t.featured ? "#E5A93C" : "#8EA89D" }} strokeWidth={2} /><span>{i}</span></li>)}
            </ul>
            {t.featured ? (
              <div className="mt-8 space-y-3" data-testid="plan-buy">
                {!h?.plan && <p className="text-sm text-[#9E9AA3]">Signups open soon — <Link to="/book" className="text-[#E5A93C]">book a call</Link> and we'll set you up by hand.</p>}
                {h?.plan && (
                  <>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Business name" className={inputCls} />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (your dashboard link goes here)" className={inputCls} data-testid="plan-email" />
                    <button onClick={() => go("month")} disabled={Boolean(busy)} className={primary} data-testid="plan-monthly">{busy === "month" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Start the plan — ${monthly}/month</button>
                    <button onClick={() => go("year")} disabled={Boolean(busy)} className={ghost} data-testid="plan-annual">{busy === "year" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Pay yearly — ${annual}</button>
                    {err && <p className="text-sm text-[#D96B43]">{err}</p>}
                    <p className="text-[11px] text-[#9E9AA3]">Secure checkout by Stripe. Cancel any time from your dashboard.</p>
                  </>
                )}
              </div>
            ) : (
              <Link to={t.cta.to} className={`${ghost} mt-8`}>{t.cta.label}</Link>
            )}
          </div>
        ))}
      </section>

      <section className="px-6 sm:px-12 lg:px-20 pb-20 grid lg:grid-cols-12 gap-10 border-t border-white/8 pt-16">
        <div className="lg:col-span-4">
          <div className={label + " mb-3"}>How the money works</div>
          <h2 className="font-display text-3xl font-light tracking-tight">One missed call pays for the month.</h2>
          <p className="text-sm text-[#9E9AA3] font-light mt-4">An HVAC repair, a crown, a consult, a Saturday table for six — most local businesses lose more than ${monthly} a month to calls that ring out after 5 pm and listings that sit on page two. The plan exists to catch those.</p>
          <Link to="/book" className={`${primary} mt-8 inline-flex`}>Talk to Bobby first — 15 min</Link>
        </div>
        <div className="lg:col-span-8">
          <div className={label + " mb-4"}>Questions</div>
          <div className="divide-y divide-white/8">
            {FAQ.map(([q, a]) => <div key={q} className="py-5"><div className="font-light">{q}</div><p className="text-sm text-[#9E9AA3] font-light mt-1">{a}</p></div>)}
          </div>
        </div>
      </section>

      <footer className="px-6 sm:px-12 lg:px-20 py-10 border-t border-white/8 text-sm text-[#9E9AA3]">
        Mesa Intelligence LLC · Las Cruces, NM · <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a> · (575) 254-1185 · <Link to="/terms" className="hover:text-[#E5A93C]">Terms</Link> · <Link to="/privacy" className="hover:text-[#E5A93C]">Privacy</Link>
      </footer>
    </main>
  );
}
