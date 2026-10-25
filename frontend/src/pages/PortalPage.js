import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Check, Copy, ExternalLink } from "lucide-react";
import { History } from "@/components/AuditReport";

// /portal?t=<token> — the Local Growth Plan client dashboard. First visit = 5-minute setup; after that:
// score trend + last report, one-tap review requests, the chat widget snippet, billing.
// /portal?cs=<checkout session>&welcome=1 — Stripe's success page; polls until the webhook has provisioned.

const inputCls = "w-full bg-transparent border border-white/12 px-4 py-3 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors";
const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3.5 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const ghost = "font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3.5 border border-white/15 hover:border-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2";
const label = "font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]";
const card = "border border-white/10 bg-[#14161A] p-6 sm:p-8";
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const fmtDate = (s) => (s ? new Date(s * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

async function api(method, query, body) {
  const res = await fetch(`/api/plan/portal${query || ""}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.detail || "Something went wrong.");
  return d;
}

export default function PortalPage() {
  const [sp, setSp] = useSearchParams();
  const cs = sp.get("cs"), welcome = sp.get("welcome") === "1";
  const [t, setT] = useState(sp.get("t") || "");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const tries = useRef(0);

  // Success page: resolve the checkout session into a portal token.
  useEffect(() => {
    if (t || !cs) return;
    let timer;
    const poll = async () => {
      try { const r = await api("GET", `?cs=${encodeURIComponent(cs)}`); if (r.token) { setT(r.token); setSp({ t: r.token, welcome: "1" }); return; } }
      catch (e) { setErr(e.message); return; }
      if (tries.current++ < 30) timer = setTimeout(poll, 3000); else setErr("Still setting up — check your email for your dashboard link, or write hello@mesaintelligence.ai.");
    };
    poll();
    return () => clearTimeout(timer);
  }, [cs, t, setSp]);

  useEffect(() => { if (!t) return; api("GET", `?t=${encodeURIComponent(t)}`).then(setD).catch((e) => setErr(e.message)); }, [t]);

  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] px-6 sm:px-12 lg:px-20 py-12 sm:py-16">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">← Mesa Intelligence</Link>
          <span className={label}>Local Growth Plan</span>
        </div>
        {err && <p className="text-[#D96B43] mb-6">{err}</p>}
        {!d && !err && <div className="flex items-center gap-3 text-[#9E9AA3]"><Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> {cs && !t ? "Thanks — setting up your plan (about a minute)…" : "Loading your dashboard…"}</div>}
        {d && (d.plan.onboarded ? <Dashboard d={d} t={t} setD={setD} welcome={welcome} /> : <Onboarding d={d} t={t} setD={setD} />)}
      </div>
    </main>
  );
}

function Onboarding({ d, t, setD }) {
  const tn = d.tenant || {};
  const [f, setF] = useState({ review_link: d.plan.settings?.review_link || "", phone_forward: d.plan.settings?.phone_forward || d.plan.phone || "", notify_email: tn.notify_email || d.plan.email || "", greeting: tn.greeting || "", about: "", hours: { ...{ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }, ...(tn.hours || {}) }, services: tn.services?.length ? tn.services : [{ name: "", minutes: 60, price: "" }] });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const setDay = (k, i, v) => setF((x) => { const h = { ...x.hours }; const cur = h[k] || ["08:00", "17:00"]; const n = [...cur]; n[i] = v; h[k] = n; return { ...x, hours: h }; });
  const toggleDay = (k) => setF((x) => ({ ...x, hours: { ...x.hours, [k]: x.hours[k] ? null : ["08:00", "17:00"] } }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { setD(await api("POST", "", { t, action: "onboard", ...f, services: f.services.filter((s) => s.name) })); window.scrollTo(0, 0); } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="space-y-6" data-testid="portal-onboarding">
      <div>
        <h1 className="font-display text-4xl sm:text-5xl font-light tracking-tight mb-3">Welcome, {d.plan.business}.</h1>
        <p className="text-[#9E9AA3] font-light max-w-2xl">Five minutes of setup and everything runs on its own. You can change any of this later from your dashboard.</p>
      </div>
      <div className={card}>
        <div className={`${label} mb-4`}>1 · Where to send bookings and leads</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input value={f.notify_email} onChange={(e) => setF({ ...f, notify_email: e.target.value })} placeholder="Email for new bookings & leads" className={inputCls} />
          <input value={f.phone_forward} onChange={(e) => setF({ ...f, phone_forward: e.target.value })} placeholder="Your business mobile (for the voice line)" className={inputCls} />
        </div>
      </div>
      <div className={card}>
        <div className={`${label} mb-4`}>2 · Hours</div>
        <div className="space-y-2">
          {DAYS.map(([k, l]) => (
            <div key={k} className="flex items-center gap-3 text-sm">
              <button type="button" onClick={() => toggleDay(k)} className={`w-14 text-left font-mono text-[11px] uppercase tracking-wider ${f.hours[k] ? "text-[#F5F3EF]" : "text-[#9E9AA3]/50"}`}>{l}</button>
              {f.hours[k] ? <><input type="time" value={f.hours[k][0]} onChange={(e) => setDay(k, 0, e.target.value)} className="bg-transparent border border-white/12 px-2 py-1" /><span className="text-[#9E9AA3]">to</span><input type="time" value={f.hours[k][1]} onChange={(e) => setDay(k, 1, e.target.value)} className="bg-transparent border border-white/12 px-2 py-1" /></> : <span className="text-[#9E9AA3]/60">Closed</span>}
            </div>
          ))}
        </div>
      </div>
      <div className={card}>
        <div className={`${label} mb-4`}>3 · Services the agent can book or quote</div>
        {f.services.map((s, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 mb-2">
            <input value={s.name} onChange={(e) => setF((x) => { const sv = [...x.services]; sv[i] = { ...sv[i], name: e.target.value }; return { ...x, services: sv }; })} placeholder="Service (e.g. AC tune-up)" className={`${inputCls} col-span-6`} />
            <input value={s.minutes} onChange={(e) => setF((x) => { const sv = [...x.services]; sv[i] = { ...sv[i], minutes: e.target.value }; return { ...x, services: sv }; })} placeholder="Minutes" className={`${inputCls} col-span-3`} />
            <input value={s.price} onChange={(e) => setF((x) => { const sv = [...x.services]; sv[i] = { ...sv[i], price: e.target.value }; return { ...x, services: sv }; })} placeholder="Price $" className={`${inputCls} col-span-3`} />
          </div>
        ))}
        <button type="button" onClick={() => setF((x) => ({ ...x, services: [...x.services, { name: "", minutes: 60, price: "" }] }))} className="text-xs text-[#E5A93C]">+ add a service</button>
      </div>
      <div className={card}>
        <div className={`${label} mb-4`}>4 · Reviews</div>
        <input value={f.review_link} onChange={(e) => setF({ ...f, review_link: e.target.value })} placeholder="Your Google review link" className={inputCls} />
        <p className="text-xs text-[#9E9AA3] mt-2">We pre-filled it from your Google listing. In Google Business Profile → "Ask for reviews" you can copy the short version if you prefer.</p>
      </div>
      <div className={card}>
        <div className={`${label} mb-4`}>5 · Anything the agent should know</div>
        <input value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} placeholder="Greeting (how the agent says hello)" className={`${inputCls} mb-3`} />
        <textarea value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} rows={4} placeholder="Service area, what you don't do, emergency fees, payment types, anything customers ask about…" className={inputCls} />
      </div>
      {err && <p className="text-sm text-[#D96B43]">{err}</p>}
      <button type="submit" disabled={busy} className={primary} data-testid="portal-onboard-submit">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Finish setup</button>
    </form>
  );
}

function Dashboard({ d, t, setD, welcome }) {
  const [rv, setRv] = useState({ customer_name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const review = async (e) => {
    e.preventDefault(); setBusy("review"); setErr(""); setMsg("");
    try { const r = await api("POST", "", { t, action: "review", ...rv }); setD({ ...d, reviews: r.reviews }); setMsg(`Sent by ${r.sent.channel} to ${rv.customer_name || "your customer"}.`); setRv({ customer_name: "", phone: "", email: "" }); } catch (e2) { setErr(e2.message); }
    setBusy("");
  };
  const billing = async () => { setBusy("billing"); try { const r = await api("POST", "", { t, action: "billing" }); window.location.href = r.url; } catch (e2) { setErr(e2.message); setBusy(""); } };
  const copy = async () => { try { await navigator.clipboard.writeText(d.widget); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} };
  const p = d.plan;
  return (
    <div className="space-y-6" data-testid="portal-dashboard">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight">{p.business}</h1>
        <span className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${p.status === "active" ? "border-[#8EA89D] text-[#8EA89D]" : "border-[#D96B43] text-[#D96B43]"}`}>{p.status}</span>
        <button onClick={billing} disabled={busy === "billing"} className="ml-auto text-xs text-[#9E9AA3] hover:text-[#E5A93C] flex items-center gap-1">Billing & invoices <ExternalLink className="w-3 h-3" /></button>
      </div>
      {welcome && <div className="border border-[#8EA89D]/50 bg-[#8EA89D]/[0.05] p-5 text-sm">You're all set. Bookmark this page — it's your private dashboard. Your phone line is below: call it, then forward your business line to it when you can't answer.</div>}

      <div className="grid md:grid-cols-12 gap-6">
        <div className={`${card} md:col-span-5`}>
          <div className={`${label} mb-3`}>Discovery score</div>
          <div className="flex items-end gap-3"><span className="font-display text-6xl font-light leading-none">{p.last_score ?? "—"}</span><span className="text-sm text-[#9E9AA3] mb-1">/100</span></div>
          <div className="mt-4"><History history={d.history} /></div>
          <p className="text-xs text-[#9E9AA3] mt-3">Next audit: {fmtDate(p.next_audit_at)}{d.last_report ? <> · <a href={d.last_report} className="text-[#E5A93C]">latest report</a></> : null}</p>
        </div>
        <div className={`${card} md:col-span-7`} data-testid="portal-review">
          <div className={`${label} mb-3`}>Ask for a review</div>
          <p className="text-sm text-[#9E9AA3] mb-4">Right after a job, type the customer's name and number. They get a short text{d.sms_enabled ? "" : " (email until texting is switched on)"} with your Google review link.</p>
          <form onSubmit={review} className="grid sm:grid-cols-3 gap-2">
            <input value={rv.customer_name} onChange={(e) => setRv({ ...rv, customer_name: e.target.value })} placeholder="Customer first name" className={inputCls} />
            <input value={rv.phone} onChange={(e) => setRv({ ...rv, phone: e.target.value })} placeholder="Mobile" className={inputCls} />
            <input value={rv.email} onChange={(e) => setRv({ ...rv, email: e.target.value })} placeholder="or email" className={inputCls} />
            <button type="submit" disabled={busy === "review"} className={`${primary} sm:col-span-3`}>{busy === "review" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Send review request</button>
          </form>
          {msg && <p className="text-sm text-[#8EA89D] mt-3">{msg}</p>}
          {err && <p className="text-sm text-[#D96B43] mt-3">{err}</p>}
          {d.reviews?.length > 0 && <div className="mt-4 text-xs text-[#9E9AA3]">{d.reviews.slice(0, 5).map((r) => <div key={r.id}>{fmtDate(r.sent_at)} · {r.customer_name || "—"} · {r.channel || "—"} · {r.status}{r.error ? ` (${r.error})` : ""}</div>)}</div>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className={card}>
          <div className={`${label} mb-3`}>Your website chat agent</div>
          <p className="text-sm text-[#9E9AA3] mb-3">Paste this one line before <code>&lt;/body&gt;</code> on your site (or send it to whoever manages it). It answers questions, books, and emails you every lead.</p>
          <pre className="text-xs bg-black/40 border border-white/8 p-3 overflow-x-auto whitespace-pre-wrap break-all">{d.widget}</pre>
          <div className="flex gap-3 mt-3">
            <button onClick={copy} className={ghost}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}</button>
            <a href={`/embed?tenant=${d.tenant?.id}`} target="_blank" rel="noreferrer" className={ghost}>Try it <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        </div>
        <div className={card}>
          <div className={`${label} mb-3`}>Your AI phone line</div>
          {d.tenant?.voice ? <p className="text-sm">Live on <span className="text-[#F5F3EF]">{d.tenant.voice_number}</span>. Call it to hear it. To put it to work, forward your business line to it when you can't answer: on most carriers dial <span className="text-[#F5F3EF]">*72</span> then the number (dial <span className="text-[#F5F3EF]">*73</span> to turn it off), or set "forward when busy / no answer" in your phone's call settings.</p>
            : <p className="text-sm text-[#9E9AA3]">Being set up — if your number isn't here within the hour, Bobby is finishing it by hand and will email it today.</p>}
          <div className={`${label} mt-6 mb-2`}>Settings</div>
          <p className="text-sm text-[#9E9AA3]">Bookings & leads go to <span className="text-[#F5F3EF]">{d.tenant?.notify_email}</span>. To change hours, services or the review link, reply to any Mesa email or write <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a>.</p>
        </div>
      </div>
      <p className="text-xs text-[#9E9AA3]">Member since {fmtDate(p.created_at)} · Questions: hello@mesaintelligence.ai · (575) 254-1185</p>
    </div>
  );
}
