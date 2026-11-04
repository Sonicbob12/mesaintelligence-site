import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Phone, PhoneOff, Loader2, Mic, Check } from "lucide-react";
import PlanOffer from "@/components/PlanOffer";

// /hear?a=<audit_id>&k=<share_key>&o=<outreach_id> — "Hear your line".
// A demo AI phone line answering as the prospect's own business (built from their Google listing).
// The browser call goes through /api/demo/line; Bobby gets an email when a prospect uses it.

const SCENARIOS = {
  hvac: ["My AC quit and it's 105 in here", "I need a furnace tune-up before winter", "How soon can someone come look at my swamp cooler?"],
  plumbing: ["Water's coming through my ceiling", "My water heater is leaking", "Kitchen drain is backed up"],
  electrical: ["Half my house lost power", "I want an EV charger installed", "An outlet is hot and smells like burning"],
  roofing: ["My roof started leaking in the storm", "I need an inspection for my insurance", "How much for a re-roof?"],
  landscaping: ["My sprinkler line broke and it's flooding", "I need a quote for xeriscape", "Can you trim two big trees?"],
  contractor: ["I need a quote on a concrete patio", "Can someone fix my fence this week?", "Do you do kitchen remodels?"],
  other: ["I need someone out this week", "Can I get a quote?", "Are you open Saturday?"],
};

export default function HearPage() {
  const [sp] = useSearchParams();
  const a = sp.get("a") || "", k = sp.get("k") || "", o = sp.get("o") || "";
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [status, setStatus] = useState("idle"); // idle | connecting | live | ended | error
  const [talking, setTalking] = useState(false);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const clientRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    fetch(`/api/demo/line?a=${encodeURIComponent(a)}&k=${encodeURIComponent(k)}${o ? `&o=${encodeURIComponent(o)}` : ""}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || "This demo link isn't valid."); return d; })
      .then((d) => { setInfo(d); try { document.title = `Hear ${d.business}'s AI phone line | Mesa Intelligence`; } catch {} })
      .catch((e) => setLoadErr(e.message));
  }, [a, k, o]);
  useEffect(() => () => { clientRef.current?.stopCall?.(); clearInterval(timerRef.current); }, []);

  const start = async () => {
    setError(""); setLines([]); setSeconds(0); setStatus("connecting");
    try {
      const res = await fetch("/api/demo/line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, k, o }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not start the call.");
      const { RetellWebClient } = await import("retell-client-js-sdk");
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => { setStatus("live"); timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); });
      client.on("call_ended", () => { setStatus("ended"); setTalking(false); clearInterval(timerRef.current); });
      client.on("agent_start_talking", () => setTalking(true));
      client.on("agent_stop_talking", () => setTalking(false));
      client.on("update", (u) => { if (Array.isArray(u?.transcript)) setLines(u.transcript.slice(-6)); });
      client.on("error", (e) => { setError(typeof e === "string" ? e : "Call error — please try again."); setStatus("error"); clearInterval(timerRef.current); client.stopCall(); });
      await client.startCall({
        accessToken: data.access_token,
        ...(data.call_id ? { callId: data.call_id } : {}),
        ...(data.transport ? { transport: data.transport } : {}),
        ...(Array.isArray(data.ice_servers) && data.ice_servers.length ? { iceServers: data.ice_servers } : {}),
      });
    } catch (e) {
      const msg = /permission|notallowed|microphone/i.test(String(e?.message || e)) ? "Your browser blocked the microphone. Allow it for this page and try again." : (e.message || "Could not start the call.");
      setError(msg); setStatus("error");
    }
  };
  const stop = () => { clientRef.current?.stopCall(); setStatus("ended"); clearInterval(timerRef.current); };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const ideas = SCENARIOS[info?.trade] || SCENARIOS.other;
  const book = `/book?a=${encodeURIComponent(a)}&k=${encodeURIComponent(k)}${o ? `&o=${encodeURIComponent(o)}` : ""}`;

  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] px-4 sm:px-12 lg:px-20 py-10 sm:py-16">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">← Mesa Intelligence</Link>

        {loadErr && <p className="mt-10 text-[#D96B43]">{loadErr} <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C] underline ml-1">hello@mesaintelligence.ai</a></p>}
        {!loadErr && !info && <div className="mt-10 flex items-center gap-3 text-[#9E9AA3]"><Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> Setting up your line…</div>}

        {info && (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#E5A93C] mt-10 mb-4">Demo line · built for {info.business}</div>
            <h1 className="font-display text-4xl sm:text-6xl font-light tracking-tight leading-[1.02] mb-5">
              Hear how <span className="font-serif-accent italic text-[#D96B43]">{info.business}</span> would answer when you can't.
            </h1>
            <p className="text-[#9E9AA3] font-light max-w-2xl mb-10">
              I set this line up from your Google listing. Press call, play a customer, and hear what your callers would hear at 9 PM, on a Saturday, or while you're up on a job. It takes the details, sorts out what's urgent and offers times — nothing gets booked here, it's a demo.
            </p>

            <div className="border border-white/10 bg-[#14161A] p-6 sm:p-8" data-testid="hear-call">
              <div className="flex items-center gap-3 mb-6">
                <Mic className="w-5 h-5 text-[#D96B43]" strokeWidth={1.25} />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Calls from your browser · uses your microphone</span>
                {status === "live" && (
                  <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8EA89D]">
                    <span className={`w-1.5 h-1.5 rounded-full bg-[#8EA89D] ${talking ? "animate-pulse-dot" : ""}`} />
                    {talking ? "Line speaking" : "Listening"} · {mmss}
                  </span>
                )}
              </div>

              <div className="min-h-[140px] space-y-2 mb-6">
                {status === "idle" && (
                  <div>
                    <p className="text-sm text-[#9E9AA3] font-light mb-3">Try saying one of these:</p>
                    <ul className="space-y-2">{ideas.map((s) => <li key={s} className="text-[#F5F3EF]/90 font-light">“{s}”</li>)}</ul>
                  </div>
                )}
                {status === "connecting" && <p className="text-[#9E9AA3] text-sm font-light flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> Ringing…</p>}
                {lines.map((l, i) => (
                  <p key={i} className={`text-sm font-light leading-relaxed ${l.role === "agent" ? "text-[#F5F3EF]/90" : "text-[#E5A93C]"}`}>
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#9E9AA3] mr-2">{l.role === "agent" ? info.business : "You"}</span>{l.content}
                  </p>
                ))}
                {status === "ended" && <p className="text-[#9E9AA3] text-sm font-light flex items-center gap-2"><Check className="w-4 h-4 text-[#8EA89D]" /> Call ended. On the real line, that call would now be on your calendar, the customer would have a text, and you'd have the summary in your inbox.</p>}
                {error && <p className="text-[#D96B43] text-sm font-light">{error}</p>}
              </div>

              {status === "live" || status === "connecting" ? (
                <button type="button" onClick={stop} className="w-full sm:w-auto font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 border border-[#D96B43] text-[#D96B43] hover:bg-[#D96B43] hover:text-[#0B0C0E] transition-colors flex items-center justify-center gap-2">
                  <PhoneOff className="w-4 h-4" /> Hang up
                </button>
              ) : (
                <button type="button" onClick={start} disabled={!info.voice} data-testid="hear-call-button" className="w-full sm:w-auto bg-[#D96B43] text-[#0B0C0E] font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  <Phone className="w-4 h-4" /> {status === "ended" || status === "error" ? "Call again" : `Call ${info.business}`}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 text-sm font-light">
              {[
                ["Keep your number", "Unanswered calls forward to the line (*72 on most carriers). Customers never see a new number."],
                ["Books the job", "Takes the details, offers your open times, puts it on your calendar and texts the customer a confirmation."],
                ["Every call in your inbox", "A short summary of each call — name, number, address, what they need."],
              ].map(([h, t]) => (
                <div key={h} className="border border-white/10 p-5"><div className="text-[#F5F3EF] mb-2">{h}</div><div className="text-[#9E9AA3]">{t}</div></div>
              ))}
            </div>

            <div className="mt-10 border border-[#E5A93C]/40 bg-[#E5A93C]/[0.04] p-6 sm:p-8">
              <div className="font-display text-2xl font-light mb-2">Want it on your real line?</div>
              <p className="text-[#9E9AA3] font-light mb-5">Fifteen minutes on the phone with Bobby and it's live — set up with your hours, your services and your calendar. Free for 14 days; if it hasn't caught a call you'd have missed, cancel and owe nothing.</p>
              <Link to={book} className="inline-flex font-mono text-[11px] uppercase tracking-[0.2em] px-6 py-4 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors">Book 15 minutes with Bobby</Link>
              <span className="block sm:inline sm:ml-4 mt-3 sm:mt-0 text-sm text-[#9E9AA3]">or call (575) 254-1185</span>
            </div>

            <PlanOffer auditId={a} shareKey={k} business={info.business} outreachId={o} />

            <p className="mt-10 text-xs text-[#9E9AA3] font-light">Mesa Intelligence LLC · Las Cruces, NM · Demo calls use an AI voice and are transcribed so Bobby can see how the line handled them. <Link to="/privacy" className="underline">Privacy</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
