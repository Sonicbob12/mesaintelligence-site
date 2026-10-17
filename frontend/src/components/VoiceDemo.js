import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneOff, Mic, Loader2 } from "lucide-react";
import ChapterBadge from "@/components/ChapterBadge";
import { fetchTenants } from "@/lib/agentClient";

// Smart Call Dispatch demo: call the number, or talk to the agent from the browser.
// Only renders once a demo tenant has a voice agent (tenant.voice === true from /api/tenants).

function prettyNumber(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export default function VoiceDemo() {
  const [tenant, setTenant] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | connecting | live | ended | error
  const [agentTalking, setAgentTalking] = useState(false);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");
  const clientRef = useRef(null);
  const timerRef = useRef(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    fetchTenants().then((list) => setTenant(list.find((t) => t.demo && t.voice) || null)).catch(() => {});
  }, []);

  useEffect(() => () => { clientRef.current?.stopCall?.(); clearInterval(timerRef.current); }, []);

  const start = async () => {
    setError(""); setLines([]); setSeconds(0); setStatus("connecting");
    try {
      const res = await fetch("/api/voice/web-call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant: tenant.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not start the call.");
      const { RetellWebClient } = await import("retell-client-js-sdk");
      const client = new RetellWebClient();
      clientRef.current = client;
      client.on("call_started", () => { setStatus("live"); timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); });
      client.on("call_ended", () => { setStatus("ended"); clearInterval(timerRef.current); });
      client.on("agent_start_talking", () => setAgentTalking(true));
      client.on("agent_stop_talking", () => setAgentTalking(false));
      client.on("update", (u) => { if (Array.isArray(u?.transcript)) setLines(u.transcript.slice(-6)); });
      client.on("error", (e) => { setError(typeof e === "string" ? e : "Call error — please try again."); setStatus("error"); clearInterval(timerRef.current); client.stopCall(); });
      await client.startCall({ accessToken: data.access_token });
    } catch (e) {
      setError(e.message || "Could not start the call."); setStatus("error");
    }
  };

  const stop = () => { clientRef.current?.stopCall(); setStatus("ended"); clearInterval(timerRef.current); };

  if (!tenant) return null;
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section id="voice" className="px-6 sm:px-12 lg:px-20 py-24 sm:py-32 lg:py-40 border-t border-white/8">
      <ChapterBadge number="04" title="Smart Call Dispatch" />
      <motion.h2
        initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-3xl sm:text-5xl font-light tracking-tight leading-[1.02] max-w-3xl mb-4"
      >
        Now <span className="font-serif-accent italic text-[#D96B43]">call</span> it.
      </motion.h2>
      <p className="text-[#9E9AA3] font-light max-w-xl mb-12">
        The same agent answers the phone for {tenant.name}. It triages, checks the real schedule, and books the job — then the booking shows up in the office. Try to get it to over-promise.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-4xl">
        {tenant.voice_number && (
          <motion.div
            initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 border border-white/10 bg-[#14161A] p-8 flex flex-col"
          >
            <Phone className="w-6 h-6 text-[#D96B43] mb-6" strokeWidth={1.25} />
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Call from your phone</div>
            <a href={`tel:${tenant.voice_number}`} data-testid="voice-demo-phone-link" className="font-display text-3xl sm:text-4xl font-light tracking-tight hover:text-[#E5A93C] transition-colors">
              {prettyNumber(tenant.voice_number)}
            </a>
            <p className="text-[#9E9AA3] text-sm font-light mt-4">A live line answered by the {tenant.name} agent. Standard call rates apply; demo calls are capped at ten minutes.</p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className={`${tenant.voice_number ? "lg:col-span-7" : "lg:col-span-12"} border border-white/10 bg-[#14161A] p-8 flex flex-col`}
        >
          <div className="flex items-center gap-3 mb-6">
            <Mic className="w-6 h-6 text-[#D96B43]" strokeWidth={1.25} />
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Call from your browser</div>
            {status === "live" && (
              <span className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8EA89D]">
                <span className={`w-1.5 h-1.5 rounded-full bg-[#8EA89D] ${agentTalking ? "animate-pulse-dot" : ""}`} />
                {agentTalking ? "Agent speaking" : "Listening"} · {mmss}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-[120px] space-y-2 mb-6" data-testid="voice-demo-transcript">
            {lines.length === 0 && status === "idle" && <p className="text-[#9E9AA3] text-sm font-light">Uses your microphone. Say something like "my AC died and it's 105 out" and see what happens.</p>}
            {status === "connecting" && <p className="text-[#9E9AA3] text-sm font-light flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> Connecting…</p>}
            {lines.map((l, i) => (
              <p key={i} className={`text-sm font-light leading-relaxed ${l.role === "agent" ? "text-[#F5F3EF]/90" : "text-[#E5A93C]"}`}>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#9E9AA3] mr-2">{l.role === "agent" ? "Agent" : "You"}</span>{l.content}
              </p>
            ))}
            {status === "ended" && <p className="text-[#9E9AA3] text-sm font-light">Call ended. Anything booked is now in the demo calendar.</p>}
            {error && <p className="text-[#D96B43] text-sm font-light">{error}</p>}
          </div>

          {status === "live" || status === "connecting" ? (
            <button type="button" onClick={stop} data-testid="voice-demo-hangup-button"
                    className="self-start font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 border border-[#D96B43] text-[#D96B43] hover:bg-[#D96B43] hover:text-[#0B0C0E] transition-colors duration-300 flex items-center gap-2">
              <PhoneOff className="w-4 h-4" /> Hang up
            </button>
          ) : (
            <button type="button" onClick={start} data-testid="voice-demo-call-button"
                    className="self-start bg-[#D96B43] text-[#0B0C0E] font-mono text-xs uppercase tracking-[0.2em] px-8 py-4 hover:bg-[#E5A93C] transition-colors duration-300 flex items-center gap-2">
              <Phone className="w-4 h-4" /> {status === "ended" || status === "error" ? "Call again" : "Start a call"}
            </button>
          )}
        </motion.div>
      </div>
    </section>
  );
}
