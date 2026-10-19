import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Check } from "lucide-react";

// /book?a=<audit_id>&k=<share_key>&o=<outreach_id> — book a 15-minute call with Bobby.
// When it arrives from an audit link, booking unlocks the Pro report for free (the outbound offer).

const TZ = "America/Denver";
const inputCls = "w-full bg-transparent border border-white/12 px-5 py-4 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors";
const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const dayKey = (ms) => new Date(ms).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const timeLabel = (ms) => new Date(ms).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export default function BookPage() {
  const [sp] = useSearchParams();
  const a = sp.get("a") || "", k = sp.get("k") || "", o = sp.get("o") || "";
  const [slots, setSlots] = useState(null);
  const [day, setDay] = useState("");
  const [pick, setPick] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", business: "", notes: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch(`/api/book/slots?a=${encodeURIComponent(a)}&k=${encodeURIComponent(k)}`).then((r) => r.json()).then((d) => { setSlots(d.slots || []); const first = d.slots?.[0]; if (first) setDay(dayKey(first.start)); }).catch(() => setSlots([]));
  }, [a, k]);
  const days = useMemo(() => { const m = new Map(); for (const s of slots || []) { const key = dayKey(s.start); if (!m.has(key)) m.set(key, []); m.get(key).push(s); } return m; }, [slots]);

  const submit = async (e) => {
    e.preventDefault(); if (!pick) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/book/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, start: pick.start, a, k, o }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.detail || "Couldn't book that — try another time.");
      setDone(d);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] px-6 sm:px-12 lg:px-20 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">← Mesa Intelligence</Link>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mt-8 mb-3">Book a 15-minute call with Bobby</h1>
        <p className="text-[#9E9AA3] font-light max-w-xl mb-10">
          {a ? "Pick a time and the full Pro audit report (normally $99) is yours free — it's emailed the moment you book." : "We'll go through your listing, your website and where you rank — and what's worth fixing first."}
          {" "}Mountain time. No pitch deck.
        </p>

        {done ? (
          <div className="border border-[#8EA89D]/50 bg-[#8EA89D]/[0.05] p-8" data-testid="book-done">
            <div className="flex items-center gap-3 font-display text-2xl font-light mb-2"><Check className="w-6 h-6 text-[#8EA89D]" /> You're booked — {done.when}</div>
            <p className="text-[#9E9AA3] font-light">A confirmation is on its way to {form.email}.{done.pro ? " Your Pro report is being built and will arrive in a separate email in about a minute." : ""}{done.link ? <> You can also open it here: <a href={done.link} className="text-[#E5A93C] break-all">{done.link}</a></> : null}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-12 gap-8" data-testid="book-form">
            <div className="md:col-span-7">
              {slots == null && <div className="flex items-center gap-2 text-[#9E9AA3]"><Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> Loading open times…</div>}
              {slots?.length === 0 && <p className="text-[#9E9AA3]">No open times in the next two weeks — email <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a> and we'll find one.</p>}
              {days.size > 0 && (
                <>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {[...days.keys()].map((d) => <button type="button" key={d} onClick={() => { setDay(d); setPick(null); }} className={`font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-2 border ${day === d ? "border-[#D96B43] text-[#E5A93C]" : "border-white/12 text-[#9E9AA3] hover:border-white/30"}`}>{d}</button>)}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" data-testid="book-slots">
                    {(days.get(day) || []).map((s) => <button type="button" key={s.start} onClick={() => setPick(s)} className={`text-sm py-3 border ${pick?.start === s.start ? "border-[#D96B43] bg-[#D96B43]/10 text-[#F5F3EF]" : "border-white/12 text-[#9E9AA3] hover:border-white/30"}`}>{timeLabel(s.start)}</button>)}
                  </div>
                </>
              )}
            </div>
            <div className="md:col-span-5 space-y-3">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className={inputCls} data-testid="book-name" />
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={inputCls} data-testid="book-email" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (I'll call you)" className={inputCls} />
              <input value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="Business name" className={inputCls} />
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything you want to cover? (optional)" rows={3} className={inputCls} />
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <button type="submit" disabled={busy || !pick} className={primary} data-testid="book-submit">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {pick ? `Book ${dayKey(pick.start)} · ${timeLabel(pick.start)}` : "Pick a time"}</button>
              {err && <p className="text-sm text-[#D96B43]">{err}</p>}
            </div>
          </form>
        )}
        <p className="text-sm text-[#9E9AA3] mt-12">Bobby Lloyd · Mesa Intelligence LLC · Las Cruces, NM · <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a></p>
      </div>
    </main>
  );
}
