import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, MapPin, ArrowRight } from "lucide-react";
import ChapterBadge from "@/components/ChapterBadge";
import AuditReport, { Bar, CheckRow, Competitors, Ranks, gradeColor } from "@/components/AuditReport";

// Local Discovery: free Google listing + website + search-rank audit, scored against nearby competitors.
// Score, rank, competitor table and top issues show instantly. The email gate unlocks the report:
//   AUDIT_PRO_MODE=free  → the full Pro report (founding period)
//   AUDIT_PRO_MODE=paid  → the basic plan, plus a Stripe button for the Pro report
//   otherwise            → the basic plan only

const inputCls = "w-full bg-transparent border border-white/12 px-5 py-4 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors duration-300";
const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Something went wrong — please try again.");
  return data;
}

const PRO_FEATURES = ["Your rank for two more searches people type (\"near me\", \"best …\")", "Duplicate / conflicting listing check", "Teardown of the #1 competitor's website — what they have that you don't", "What your reviews say customers love and complain about", "Google PageSpeed mobile scores", "An 8-step plan with a 30-day order of operations", "A printable report page you can share"];

export default function LocalAudit() {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState(null);
  const [audit, setAudit] = useState(null);
  const [report, setReport] = useState(null); // { plan, full?, pro, link }
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", business: "", website: "" });
  const [health, setHealth] = useState(null);

  // Stay hidden until the Google Places key is configured.
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {}); }, []);
  const enabled = Boolean(health?.places);
  const proMode = audit?.pro_mode || health?.audit_pro_mode || "off";
  const proPrice = audit?.pro_price || health?.audit_pro_price || 99;

  const search = async (e) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setBusy("search"); setError(""); setCandidates(null); setAudit(null); setReport(null);
    try {
      const { candidates } = await post("/api/audit/search", { query: query.trim() });
      if (!candidates.length) setError("No Google listing matched. Try the exact business name plus the city.");
      setCandidates(candidates);
    } catch (err) { setError(err.message); }
    setBusy("");
  };

  const run = async (c) => {
    setBusy("run"); setError(""); setCandidates(null);
    try {
      const a = await post("/api/audit/run", { place_id: c.id, query: query.trim() });
      setAudit(a);
      setForm((f) => ({ ...f, business: a.place.name }));
    } catch (err) { setError(err.message); }
    setBusy("");
  };

  const unlock = async (e) => {
    e.preventDefault();
    setBusy("report"); setError("");
    try {
      const r = await post("/api/audit/report", { audit_id: audit.audit_id, ...form });
      setReport({ plan: r.plan || { fixes: [] }, full: r.full || null, pro: Boolean(r.pro), link: r.link });
    } catch (err) { setError(err.message); }
    setBusy("");
  };

  const buyPro = async () => {
    setBusy("checkout"); setError("");
    try {
      const r = await post("/api/audit/checkout", { audit_id: audit.audit_id, email: form.email, name: form.name });
      window.location.href = r.url;
    } catch (err) { setError(err.message); setBusy(""); }
  };

  const reset = () => { setAudit(null); setReport(null); setCandidates(null); setError(""); };

  if (!enabled) return null;
  const primaryRank = audit?.visibility?.queries?.[0];

  return (
    <section id="audit" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40 border-t border-white/8">
      <ChapterBadge number="05" title="Local Discovery" />
      <motion.h2
        initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] max-w-3xl mb-4"
      >
        How do you <span className="font-serif-accent italic text-[#D96B43]">show up</span> next to the competition?
      </motion.h2>
      <p className="text-[#9E9AA3] font-light max-w-xl mb-12">
        A free audit of your Google listing, your website, and where you rank when someone searches for what you do — scored against the businesses people see right next to you. Takes about 15 seconds.
      </p>

      <div className="max-w-5xl">
        {!audit && (
          <form onSubmit={search} className="flex flex-col sm:flex-row gap-3 max-w-2xl" data-testid="audit-search-form">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#9E9AA3] absolute left-5 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Business name + city, e.g. Rio Grande Plumbing Las Cruces"
                className={`${inputCls} pl-12`} maxLength={120} data-testid="audit-query" />
            </div>
            <button type="submit" disabled={busy === "search" || query.trim().length < 3} className={primary} data-testid="audit-search">
              {busy === "search" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Find my listing
            </button>
          </form>
        )}

        {candidates?.length > 0 && (
          <div className="mt-6 max-w-2xl border border-white/10 bg-[#14161A] divide-y divide-white/8" data-testid="audit-candidates">
            <div className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Which one is you?</div>
            {candidates.map((c) => (
              <button key={c.id} onClick={() => run(c)} className="w-full text-left px-5 py-4 hover:bg-white/[0.03] flex items-start gap-4 group" data-testid="audit-candidate">
                <MapPin className="w-4 h-4 mt-1 text-[#D96B43] shrink-0" strokeWidth={1.5} />
                <span className="flex-1">
                  <span className="block font-light">{c.name}{c.closed ? <span className="text-[#D96B43] text-xs ml-2">(listed as closed)</span> : null}</span>
                  <span className="block text-xs text-[#9E9AA3] mt-0.5">{c.type ? `${c.type} · ` : ""}{c.address}</span>
                </span>
                <ArrowRight className="w-4 h-4 mt-1 text-[#9E9AA3] group-hover:text-[#E5A93C]" />
              </button>
            ))}
            <div className="px-5 py-2 text-[11px] text-[#9E9AA3]/70">Google Maps</div>
          </div>
        )}

        {busy === "run" && (
          <div className="mt-8 flex items-center gap-3 text-[#9E9AA3] font-light" data-testid="audit-running">
            <Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> Checking your listing, where you rank, the competitors around you, and your website…
          </div>
        )}

        {error && <p className="mt-6 text-sm text-[#D96B43]" data-testid="audit-error">{error}</p>}

        <AnimatePresence>
          {audit && (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="space-y-6" data-testid="audit-result">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <div className="font-display text-2xl font-light">{audit.place.name}</div>
                <div className="text-sm text-[#9E9AA3]">{audit.place.address}</div>
                <button onClick={reset} className="ml-auto text-xs text-[#9E9AA3] hover:text-[#E5A93C]">Audit another business</button>
              </div>

              {/* Full report replaces the teaser once unlocked */}
              {report?.full ? (
                <>
                  <AuditReport full={report.full} plan={report.plan} pro={report.pro} link={report.link} />
                  <p className="text-sm text-[#9E9AA3]">A copy is on its way to {form.email}. Want a hand with any of it? <a href="#contact" className="text-[#E5A93C] hover:underline">Book a free walkthrough</a>.</p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-4 border border-white/10 bg-[#14161A] p-8 flex flex-col">
                      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-4">Discovery score</div>
                      <div className="flex items-end gap-3">
                        <span className="font-display text-7xl font-light leading-none" data-testid="audit-score">{audit.score}</span>
                        <span className="font-display text-3xl mb-1" style={{ color: gradeColor(audit.grade) }}>{audit.grade}</span>
                      </div>
                      <div className="mt-8 space-y-3 text-sm">
                        <Bar label="Google listing" value={audit.listingScore} />
                        <Bar label="Website" value={audit.hasWebsite ? audit.websiteScore : null} />
                        {audit.visibility && <Bar label="Search visibility" value={audit.visibility.score} />}
                      </div>
                      {primaryRank && (
                        <div className="mt-8 pt-6 border-t border-white/8" data-testid="audit-primary-rank">
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">When someone searches</div>
                          <Ranks visibility={{ queries: [primaryRank] }} />
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-8 border border-white/10 bg-[#14161A] p-8 overflow-x-auto">
                      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-4">
                        You vs. {audit.competitors.count - 1} nearby {(audit.place.category || audit.place.typeLabel) ? `${(audit.place.category || audit.place.typeLabel).toLowerCase()}s` : "competitors"}
                      </div>
                      <Competitors competitors={audit.competitors} category={audit.place.category || audit.place.typeLabel} />
                      <div className="text-[11px] text-[#9E9AA3]/70 mt-4">Google Maps</div>
                    </div>
                  </div>

                  <div className="border border-white/10 bg-[#14161A] p-8">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-4">{report ? "Everything we checked" : "Biggest problems"}</div>
                    <div className="divide-y divide-white/8">
                      {(report ? [...audit.listing, ...(audit.website?.checks || []), ...(audit.visibility?.checks || [])] : audit.issues.slice(0, 3)).map((c) => <CheckRow key={c.id} c={c} showFix={!report || c.status !== "pass"} />)}
                    </div>
                    {!report && audit.issues.length > 3 && <p className="text-sm text-[#9E9AA3] mt-4">+ {audit.issues.length - 3} more issues in the full report.</p>}
                  </div>

                  {!report && (
                    <form onSubmit={unlock} className="border border-[#D96B43]/40 bg-[#D96B43]/[0.04] p-8 grid grid-cols-1 md:grid-cols-12 gap-6" data-testid="audit-unlock-form">
                      <div className="md:col-span-5">
                        <div className="font-display text-2xl font-light mb-2">{proMode === "free" ? "Get the full Pro report — free" : "Get the fix-it plan"}</div>
                        {proMode === "free" ? (
                          <>
                            <p className="text-sm text-[#9E9AA3] font-light">Normally ${proPrice}. Free for our first local businesses while we launch. You'll get:</p>
                            <ul className="text-sm text-[#9E9AA3] font-light mt-3 space-y-1">{PRO_FEATURES.map((f) => <li key={f}>· {f}</li>)}</ul>
                          </>
                        ) : (
                          <p className="text-sm text-[#9E9AA3] font-light">A prioritized list of what to fix first and how — most of it you can do yourself this week. We'll email you the full report too.</p>
                        )}
                      </div>
                      <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className={inputCls} data-testid="audit-name" />
                        <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={inputCls} data-testid="audit-email" />
                        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className={inputCls} />
                        <input value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="Business name" className={inputCls} />
                        <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                        <button type="submit" disabled={busy === "report"} className={`${primary} sm:col-span-2`} data-testid="audit-unlock">
                          {busy === "report" ? <><Loader2 className="w-4 h-4 animate-spin" /> {proMode === "free" ? "Building your Pro report (about 15 seconds)…" : "Writing your plan…"}</> : proMode === "free" ? "Send me the Pro report" : "Send me the plan"}
                        </button>
                      </div>
                    </form>
                  )}

                  {report && !report.full && (
                    <div className="border border-white/10 bg-[#14161A] p-8" data-testid="audit-plan">
                      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-3">Your fix-it plan</div>
                      {report.plan.headline && <p className="font-display text-xl font-light mb-6">{report.plan.headline}</p>}
                      <ol className="space-y-5">
                        {report.plan.fixes.map((f, i) => (
                          <li key={i} className="flex gap-4">
                            <span className="font-mono text-sm text-[#D96B43] w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                            <div>
                              <div className="font-light">{f.title} <span className="text-xs text-[#9E9AA3] ml-2 uppercase tracking-wider">{f.impact} impact{f.effort ? ` · ${f.effort}` : ""}</span></div>
                              <p className="text-sm text-[#9E9AA3] mt-1">{f.why}</p>
                              <p className="text-sm mt-1">{f.how}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <p className="text-sm text-[#9E9AA3] mt-8">A copy is on its way to {form.email}{report.link ? <> — your report page: <a href={report.link} className="text-[#E5A93C] break-all">{report.link}</a></> : null}. Want a hand with any of it? <a href="#contact" className="text-[#E5A93C] hover:underline">Book a free walkthrough</a>.</p>
                    </div>
                  )}

                  {report && !report.full && proMode === "paid" && (
                    <div className="border border-[#E5A93C]/50 bg-[#E5A93C]/[0.04] p-8 grid grid-cols-1 md:grid-cols-12 gap-6" data-testid="audit-pro-offer">
                      <div className="md:col-span-8">
                        <div className="font-display text-2xl font-light mb-2">Go deeper with the Pro report</div>
                        <ul className="text-sm text-[#9E9AA3] font-light space-y-1">{PRO_FEATURES.map((f) => <li key={f}>· {f}</li>)}</ul>
                      </div>
                      <div className="md:col-span-4 flex flex-col justify-center gap-3">
                        <div className="font-display text-4xl font-light">${proPrice} <span className="text-sm text-[#9E9AA3]">one time</span></div>
                        <button onClick={buyPro} disabled={busy === "checkout"} className={primary} data-testid="audit-buy-pro">{busy === "checkout" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Unlock the Pro report</button>
                        <p className="text-[11px] text-[#9E9AA3]">Secure checkout by Stripe. Delivered to your email and report page within a minute.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              <p className="text-[11px] text-[#9E9AA3]/60">Listing data from Google Maps. Scores are Mesa Intelligence's assessment, not Google's.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
