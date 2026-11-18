import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// /admin → Website previews: today's text list. Bobby texts each owner by hand from his own phone.
// Text 1 asks; Text 2 (with the link) goes only after they answer. Then mark the status here.
const btn = "font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2.5 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const ghost = "font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 border border-white/15 hover:border-[#E5A93C] transition-colors disabled:opacity-40";
const fmt = (s) => (s ? new Date(s * 1000).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const LINE = { mobile: "mobile", landline: "landline", fixedVoip: "VoIP", nonFixedVoip: "VoIP (app)", tollFree: "toll-free", voip: "VoIP" };
const COLOR = { ready: "#E5A93C", texted: "#9E9AA3", replied: "#8EA89D", link_sent: "#8EA89D", claimed: "#8EA89D", declined: "#D96B43", optout: "#D96B43" };
const LABEL = { ready: "to text", texted: "texted", replied: "replied", link_sent: "link sent", claimed: "signed up", declined: "not interested", optout: "opted out" };
const FILTERS = [["open", "To text"], ["working", "In progress"], ["all", "All"]];

export default function AdminPreviews({ call }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("open");
  const [copied, setCopied] = useState("");

  const load = useCallback(() => call("/admin/previews?days=30").then(setD).catch((e) => setErr(e.message)), [call]);
  useEffect(() => { load(); }, [load]);

  const build = async () => {
    setBusy(true); setErr(""); setNote("");
    try {
      const r = await call("/admin/previews", { method: "POST", body: JSON.stringify({ build: true }) });
      setNote(`Built ${r.built.length}${r.skipped.length ? ` · skipped ${r.skipped.length} (${r.skipped.map((s) => `${s.business}: ${s.reason}`).join("; ")})` : ""}${!r.built.length && !r.pool ? " · no businesses without a website left in the pool. The outbound runs add more each weekday." : ""}`);
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const mark = async (id, status) => { try { await call("/admin/previews", { method: "POST", body: JSON.stringify({ id, status }) }); load(); } catch (e) { setErr(e.message); } };
  const copy = async (key, text) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { setErr("Couldn't copy. Long-press the text to copy it."); } };

  const list = (d?.previews || []).filter((p) => filter === "all" || (filter === "open" ? p.status === "ready" : ["texted", "replied", "link_sent"].includes(p.status)));
  const t = d?.totals || {};
  const n = (k) => t[k]?.n || 0;
  const views = Object.values(t).reduce((a, x) => a + (x.views || 0), 0);
  const claims = Object.values(t).reduce((a, x) => a + (x.claims || 0), 0);

  return (
    <section className="border border-white/10 bg-[#14161A] p-6 space-y-5" data-testid="admin-previews">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Website previews: text list</div>
        {d && <span className="text-sm text-[#9E9AA3]">Built today {d.today}/{d.daily}{d.enabled ? "" : " · daily build OFF (PREVIEWS_ENABLED=0)"}</span>}
      </div>
      {d && (
        <div className="text-sm text-[#9E9AA3]">
          To text <span className="text-[#F5F3EF]">{n("ready")}</span> · texted {n("texted")} · replied {n("replied")} · link sent {n("link_sent")} · signed up <span className="text-[#8EA89D]">{n("claimed")}</span> · no {n("declined") + n("optout")} · site views {views} · payment link opens {claims}
        </div>
      )}
      <p className="text-xs text-[#9E9AA3] max-w-3xl">Text from <b>your own phone</b>, one at a time. Don't use the Mesa Twilio number: it's registered for appointment texts only. <b>Text 1</b> asks if you can send it. <b>Text 2</b> is only the link; mark "link sent" when you send it, because that starts the 7-day clock shown on their page. Then wait. Don't bring up price until they ask what's next (<b>Text 3</b>). <b>Text 4</b> is the payment link ($249/mo, no setup fee, no contract). If anyone says stop or not interested, mark them and never text again.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <button className={btn} disabled={busy} onClick={build}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Build today's batch now</button>
        {FILTERS.map(([k, l]) => <button key={k} className={ghost} style={filter === k ? { borderColor: "#E5A93C", color: "#E5A93C" } : null} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {err && <div className="text-sm text-[#D96B43]">{err}</div>}
      {note && <div className="text-sm text-[#9E9AA3]">{note}</div>}

      {d && !list.length && <div className="text-sm text-[#9E9AA3]">{filter === "open" ? "Nothing to text right now. Previews build automatically each weekday morning, or press Build." : "None."}</div>}
      <div className="space-y-3">
        {list.map((p) => (
          <div key={p.id} className="border border-white/8 p-4 space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-[#F5F3EF] text-base">{p.business}</span>
              <span className="text-sm text-[#9E9AA3]">{p.trade} · {p.market}</span>
              <a className="text-sm text-[#E5A93C]" href={`tel:${p.phone}`}>{p.phone}</a>
              <span className="text-xs" style={{ color: p.line_type === "mobile" ? "#8EA89D" : "#9E9AA3" }}>{LINE[p.line_type] || "line type ?"}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 border" style={{ color: COLOR[p.status], borderColor: COLOR[p.status] }}>{LABEL[p.status] || p.status}</span>
              {p.views > 0 && <span className="text-xs text-[#8EA89D]">👀 {p.views} view{p.views === 1 ? "" : "s"}, last {fmt(p.last_view_at)}</span>}
              {p.claim_clicks > 0 && <span className="text-xs text-[#D96B43]">🔥 opened the payment link</span>}
              {p.expires_at && p.status !== "claimed" && <span className="text-xs" style={{ color: p.expired ? "#D96B43" : "#9E9AA3" }}>{p.expired ? "preview came down" : "comes down"} {fmt(p.expires_at)}</span>}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {[["Text 1: ask", p.texts.first, p.texts.sms_first, "1"], ["Text 2: the link, after they say yes", p.texts.followup, p.texts.sms_followup, "2"], ["Text 3: only when they ask what's next or the price", p.texts.offer, p.texts.sms_offer, "3"], ["Text 4: payment link, after they say go", p.texts.start, p.texts.sms_start, "4"]].map(([label, text, sms, k]) => (
                <div key={k} className="bg-[#0B0C0E] border border-white/8 p-3 space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#9E9AA3]">{label}</div>
                  <div className="text-sm text-[#D8D4CE] whitespace-pre-wrap">{text}</div>
                  <div className="flex gap-2">
                    <button className={ghost} onClick={() => copy(p.id + k, text)}>{copied === p.id + k ? "Copied" : "Copy"}</button>
                    {sms && <a className={ghost} href={sms}>Open in Messages</a>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <a className={ghost} href={`${p.url}?admin=1`} target="_blank" rel="noreferrer">See the site</a>
              <span className="text-xs text-[#9E9AA3] mx-1">Mark:</span>
              {["texted", "replied", "link_sent", "claimed", "declined", "optout"].map((s) => (
                <button key={s} className={ghost} disabled={p.status === s} onClick={() => mark(p.id, s)}>{LABEL[s]}</button>
              ))}
              <span className="text-xs text-[#9E9AA3] ml-auto">built {fmt(p.created_at)}{p.texted_at ? ` · texted ${fmt(p.texted_at)}` : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
