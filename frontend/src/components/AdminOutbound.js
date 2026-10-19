import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// /admin → Outbound: today's plan, run it (dry or live), the log, bookings, and status changes.
const btn = "font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2.5 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const ghost = "font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2.5 border border-white/15 hover:border-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const fmt = (s) => (s ? new Date(s * 1000).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const STATUS_COLOR = { sent: "#E5A93C", followup_sent: "#E5A93C", booked: "#8EA89D", replied: "#8EA89D", queued: "#9E9AA3", skipped: "#9E9AA3", unsubscribed: "#D96B43", bounced: "#D96B43", error: "#D96B43" };
const STATUSES = ["sent", "followup_sent", "booked", "replied", "skipped", "unsubscribed", "bounced"];

export default function AdminOutbound({ call }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [days, setDays] = useState(7);

  const load = useCallback(() => call(`/admin/outbound?days=${days}`).then(setD).catch((e) => setErr(e.message)), [call, days]);
  useEffect(() => { load(); }, [load]);

  const run = async (body, kind) => {
    setBusy(kind); setErr(""); setResult(null);
    try { setResult(await call("/admin/outbound", { method: "POST", body: JSON.stringify(body) })); load(); }
    catch (e) { setErr(e.message); }
    setBusy("");
  };
  const mark = async (id, status) => { try { await call("/admin/outbound", { method: "POST", body: JSON.stringify({ id, status }) }); load(); } catch (e) { setErr(e.message); } };

  const p = d?.plan;
  return (
    <section className="border border-white/10 bg-[#14161A] p-6 space-y-5" data-testid="admin-outbound">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Outbound</div>
        {d && <span className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${d.enabled ? "border-[#8EA89D] text-[#8EA89D]" : "border-[#E5A93C] text-[#E5A93C]"}`}>{d.enabled ? "LIVE" : "DRY RUN — set OUTBOUND_ENABLED=1"}</span>}
        {d && !d.calendar && <span className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border border-[#D96B43] text-[#D96B43]">No SALES_CALENDAR_ID — bookings won't hit your calendar</span>}
      </div>
      {p && (
        <div className="text-sm">
          <span className="text-[#9E9AA3]">Today ({p.day}, week {p.week}): </span>
          {p.category ? <><span className="text-[#F5F3EF]">{p.category.label}</span> in <span className="text-[#F5F3EF]">{p.city.label}</span> · cap {d.cap}/day · from {d.from}</> : <span>{p.mode === "followups" ? "Follow-ups + digest only (Friday)" : "Nothing scheduled (weekend)"}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button className={ghost} disabled={Boolean(busy)} onClick={() => run({ run: "daily", dry: true, limit: 3 }, "dry")}>{busy === "dry" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Dry run (3, no send)</button>
        <button className={btn} disabled={Boolean(busy) || !d?.enabled} onClick={() => run({ run: "daily" }, "daily")}>{busy === "daily" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Run today's send</button>
        <button className={ghost} disabled={Boolean(busy)} onClick={() => run({ run: "followups", dry: !d?.enabled }, "fu")}>{busy === "fu" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Follow-ups</button>
        <button className={ghost} disabled={Boolean(busy)} onClick={() => run({ run: "digest" }, "digest")}>{busy === "digest" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Email me the digest</button>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-transparent border border-white/15 px-3 text-sm"><option value={1}>Today</option><option value={7}>7 days</option><option value={30}>30 days</option></select>
      </div>
      {err && <div className="text-sm text-[#D96B43]">{err}</div>}

      {result && (
        <div className="border-t border-white/8 pt-4 text-sm space-y-2" data-testid="admin-outbound-result">
          {result.run && <div className="text-[#9E9AA3]">{result.run.mode}: found {result.run.found} · emailed {result.run.emailed} · skipped {result.run.skipped} · follow-ups {result.run.followups}{result.run.errors?.length ? <span className="text-[#D96B43]"> · {result.run.errors.length} errors</span> : null}{result.live === false ? " · dry run" : ""}</div>}
          {result.emailed != null && !result.run && <div className="text-[#9E9AA3]">Digest {result.emailed ? "sent" : "not sent (check RESEND/LEAD_TO)"}.</div>}
          {(result.log || []).map((l, i) => (
            <div key={i} className="border border-white/8 p-3">
              <div><span className="text-[#F5F3EF]">{l.business}</span> <span className="text-[#9E9AA3]">{l.email || ""} · {l.status}{l.reason ? ` — ${l.reason}` : ""}{l.score != null ? ` · score ${l.score}` : ""}{l.rank ? ` · #${l.rank}` : ""}</span></div>
              {l.subject && <div className="text-[#E5A93C] mt-1">Subject: {l.subject}</div>}
              {l.preview && <pre className="text-xs text-[#9E9AA3] whitespace-pre-wrap mt-1">{l.preview}…</pre>}
            </div>
          ))}
          {result.run?.errors?.length > 0 && <pre className="text-xs text-[#D96B43] whitespace-pre-wrap">{result.run.errors.join("\n")}</pre>}
        </div>
      )}

      {d && (
        <div className="border-t border-white/8 pt-4 grid lg:grid-cols-12 gap-6 text-sm">
          <div className="lg:col-span-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Log ({d.recent.length})</div>
            {!d.recent.length && <div className="text-[#9E9AA3]">Nothing yet.</div>}
            {d.recent.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]"><th className="font-normal pb-2 pr-3">When</th><th className="font-normal pr-3">Business</th><th className="font-normal pr-3">Email</th><th className="font-normal pr-3">Score</th><th className="font-normal pr-3">Rank</th><th className="font-normal pr-3">Status</th><th className="font-normal">Mark</th></tr></thead>
                  <tbody>{d.recent.map((r) => (
                    <tr key={r.id} className="border-t border-white/8 align-top">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-[#9E9AA3]">{fmt(r.sent_at || r.created_at)}</td>
                      <td className="py-1.5 pr-3 max-w-[200px] truncate" title={r.subject || ""}>{r.business}<div className="text-[10px] text-[#9E9AA3]">{r.category} · {r.city}</div></td>
                      <td className="py-1.5 pr-3 max-w-[200px] truncate">{r.email || <span className="text-[#9E9AA3]">—</span>}</td>
                      <td className="py-1.5 pr-3">{r.score ?? "—"}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{r.rank_label ? `${r.rank_position ? `#${r.rank_position}` : "n/a"}` : "—"}</td>
                      <td className="py-1.5 pr-3" style={{ color: STATUS_COLOR[r.status] || "#F5F3EF" }}>{r.status}{r.skip_reason ? <div className="text-[10px] text-[#9E9AA3]">{r.skip_reason}</div> : null}</td>
                      <td className="py-1.5"><select value="" onChange={(e) => e.target.value && mark(r.id, e.target.value)} className="bg-transparent border border-white/15 text-xs px-1"><option value="">…</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <div className="lg:col-span-4 space-y-5">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Booked calls</div>
              {!d.bookings.length && <div className="text-[#9E9AA3]">None in range.</div>}
              {d.bookings.map((b) => <div key={b.id} className="border border-white/8 p-2 mb-2"><div className="text-[#F5F3EF]">{b.business || b.ob_business || b.name}</div><div className="text-[#9E9AA3] text-xs">{b.name} · {b.email}{b.phone ? ` · ${b.phone}` : ""}</div><div className="text-[#E5A93C] text-xs">{fmt(b.start_at)} · {b.source}</div></div>)}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Totals</div>
              <div className="text-[#9E9AA3]">{Object.entries(d.totals || {}).map(([k, v]) => <span key={k} className="mr-3"><span style={{ color: STATUS_COLOR[k] || "#F5F3EF" }}>{v}</span> {k}</span>)}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Runs</div>
              {d.runs.map((r) => <div key={r.id} className="text-xs text-[#9E9AA3]">{r.day} {r.mode}{r.category ? ` · ${r.category}/${r.city}` : ""}: found {r.found}, emailed {r.emailed}, skipped {r.skipped}, follow-ups {r.followups}{JSON.parse(r.errors_json || "[]").length ? <span className="text-[#D96B43]"> · {JSON.parse(r.errors_json).length} err</span> : null}</div>)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
