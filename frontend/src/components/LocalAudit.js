import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, MapPin, Check, AlertTriangle, X, ArrowRight, Star } from "lucide-react";
import ChapterBadge from "@/components/ChapterBadge";

// Local Discovery: free Google listing + website audit, scored against nearby competitors.
// Score, competitor table and top issues are shown instantly; the AI fix-it plan and full
// checklist unlock with an email (that's the lead).

const inputCls = "w-full bg-transparent border border-white/12 px-5 py-4 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors duration-300";
const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const gradeColor = (g) => ({ A: "#8EA89D", B: "#8EA89D", C: "#E5A93C", D: "#D96B43", F: "#D96B43" }[g] || "#9E9AA3");

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Something went wrong — please try again.");
  return data;
}

export default function LocalAudit() {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState(null);
  const [audit, setAudit] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", business: "", website: "" });
  const [enabled, setEnabled] = useState(false);

  // Stay hidden until the Google Places key is configured.
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then((h) => setEnabled(Boolean(h.places))).catch(() => {}); }, []);

  const search = async (e) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setBusy("search"); setError(""); setCandidates(null); setAudit(null); setPlan(null);
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
      setPlan(r.plan || { fixes: [] });
    } catch (err) { setError(err.message); }
    setBusy("");
  };

  const reset = () => { setAudit(null); setPlan(null); setCandidates(null); setError(""); };

  if (!enabled) return null;

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
        A free audit of your Google listing and website, scored against the businesses people see right next to you. Takes about 15 seconds.
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
            <Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> Checking your listing, the competitors around you, and your website…
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
                  </div>
                </div>

                <div className="md:col-span-8 border border-white/10 bg-[#14161A] p-8 overflow-x-auto">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-4">
                    You vs. {audit.competitors.count - 1} nearby {(audit.place.category || audit.place.typeLabel) ? `${(audit.place.category || audit.place.typeLabel).toLowerCase()}s` : "competitors"}
                  </div>
                  {audit.competitors.count > 1 ? (
                    <>
                      <table className="w-full text-sm" data-testid="audit-competitors">
                        <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]"><th className="pb-2 font-normal">Business</th><th className="pb-2 font-normal">Rating</th><th className="pb-2 font-normal">Reviews</th>{audit.competitors.rows.some((r) => r.photoCount != null) && <th className="pb-2 font-normal">Photos</th>}</tr></thead>
                        <tbody>
                          {[...audit.competitors.rows].sort((a, b) => b.reviewCount - a.reviewCount).map((r) => (
                            <tr key={r.id} className={`border-t border-white/8 ${r.you ? "text-[#E5A93C]" : ""}`}>
                              <td className="py-2 pr-4 max-w-[220px] truncate">{r.you ? "You" : r.name}</td>
                              <td className="py-2 pr-4 whitespace-nowrap">{r.rating != null ? <span className="inline-flex items-center gap-1">{r.rating.toFixed(1)} <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} /></span> : "—"}</td>
                              <td className="py-2 pr-4">{r.reviewCount}</td>
                              {audit.competitors.rows.some((x) => x.photoCount != null) && <td className="py-2 pr-4">{r.photoCount == null ? "—" : r.photoCount >= 10 ? "10+" : r.photoCount}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-sm text-[#9E9AA3] mt-4">
                        You're <span className="text-[#F5F3EF]">#{audit.competitors.rankByReviews} of {audit.competitors.count}</span> by reviews
                        {audit.competitors.reviewsToMedian ? <> — about <span className="text-[#F5F3EF]">{audit.competitors.reviewsToMedian} more</span> gets you to the local median</> : null}.
                      </p>
                    </>
                  ) : <p className="text-sm text-[#9E9AA3]">No close competitors came up nearby.</p>}
                  <div className="text-[11px] text-[#9E9AA3]/70 mt-4">Google Maps</div>
                </div>
              </div>

              <div className="border border-white/10 bg-[#14161A] p-8">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-4">{plan ? "Everything we checked" : "Biggest problems"}</div>
                <div className="divide-y divide-white/8">
                  {(plan ? [...audit.listing, ...(audit.website?.checks || [])] : audit.issues.slice(0, 3)).map((c) => <CheckRow key={c.id} c={c} showFix={!plan} />)}
                </div>
                {!plan && audit.issues.length > 3 && <p className="text-sm text-[#9E9AA3] mt-4">+ {audit.issues.length - 3} more issues in the full report.</p>}
              </div>

              {!plan && (
                <form onSubmit={unlock} className="border border-[#D96B43]/40 bg-[#D96B43]/[0.04] p-8 grid grid-cols-1 md:grid-cols-12 gap-6" data-testid="audit-unlock-form">
                  <div className="md:col-span-5">
                    <div className="font-display text-2xl font-light mb-2">Get the fix-it plan</div>
                    <p className="text-sm text-[#9E9AA3] font-light">A prioritized list of what to fix first and how — most of it you can do yourself this week. We'll email you the full report too.</p>
                  </div>
                  <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className={inputCls} data-testid="audit-name" />
                    <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={inputCls} data-testid="audit-email" />
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className={inputCls} />
                    <input value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="Business name" className={inputCls} />
                    <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                    <button type="submit" disabled={busy === "report"} className={`${primary} sm:col-span-2`} data-testid="audit-unlock">
                      {busy === "report" ? <><Loader2 className="w-4 h-4 animate-spin" /> Writing your plan…</> : "Send me the plan"}
                    </button>
                  </div>
                </form>
              )}

              {plan && (
                <div className="border border-white/10 bg-[#14161A] p-8" data-testid="audit-plan">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-3">Your fix-it plan</div>
                  {plan.headline && <p className="font-display text-xl font-light mb-6">{plan.headline}</p>}
                  <ol className="space-y-5">
                    {plan.fixes.map((f, i) => (
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
                  <p className="text-sm text-[#9E9AA3] mt-8">A copy is on its way to {form.email}. Want a hand with any of it? <a href="#contact" className="text-[#E5A93C] hover:underline">Book a free walkthrough</a>.</p>
                </div>
              )}
              <p className="text-[11px] text-[#9E9AA3]/60">Listing data from Google Maps. Scores are Mesa Intelligence's assessment, not Google's.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Bar({ label, value }) {
  return (
    <div>
      <div className="flex justify-between mb-1"><span className="text-[#9E9AA3]">{label}</span><span>{value == null ? "none" : value}</span></div>
      <div className="h-1 bg-white/8"><div className="h-1 bg-[#D96B43]" style={{ width: `${value || 0}%` }} /></div>
    </div>
  );
}

function CheckRow({ c, showFix }) {
  const Icon = c.status === "pass" ? Check : c.status === "warn" ? AlertTriangle : X;
  const color = c.status === "pass" ? "#8EA89D" : c.status === "warn" ? "#E5A93C" : "#D96B43";
  return (
    <div className="py-3 flex gap-4" data-testid="audit-check">
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} strokeWidth={2} />
      <div className="flex-1">
        <div className="flex flex-wrap gap-x-3"><span className="font-light">{c.label}</span><span className="text-sm text-[#9E9AA3]">{c.detail}</span></div>
        {showFix && c.fix && <p className="text-sm text-[#9E9AA3]/90 mt-1">{c.fix}</p>}
      </div>
    </div>
  );
}
