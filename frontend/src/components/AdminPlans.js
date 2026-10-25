import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// /admin → Plans: Local Growth Plan subscribers.
const fmt = (s) => (s ? new Date(s * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const btn = "font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2.5 border border-white/15 hover:border-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const COLOR = { active: "#8EA89D", past_due: "#E5A93C", canceled: "#D96B43", pending: "#9E9AA3" };

export default function AdminPlans({ call }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(() => call("/admin/plans").then(setD).catch((e) => setErr(e.message)), [call]);
  useEffect(() => { load(); }, [load]);
  const act = async (body, k) => { setBusy(k); setErr(""); try { await call("/admin/plans", { method: "POST", body: JSON.stringify(body) }); load(); } catch (e) { setErr(e.message); } setBusy(""); };
  const mrr = (d?.plans || []).filter((p) => p.status === "active").reduce((a, p) => a + (p.interval === "year" ? 199 : 249) + (p.usage && !p.usage.trialing ? p.usage.overage_usd || 0 : 0), 0);
  return (
    <section className="border border-white/10 bg-[#14161A] p-6 space-y-4" data-testid="admin-plans">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Local Growth Plan — subscribers</div>
        {d && !d.configured && <span className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border border-[#D96B43] text-[#D96B43]">Set STRIPE_PLAN_PRICE_ID to open signups</span>}
        {d && <span className="text-sm text-[#9E9AA3]">{(d.plans || []).filter((p) => p.status === "active").length} active · ≈ ${mrr.toLocaleString()}/mo</span>}
        <button className={`${btn} ml-auto`} disabled={Boolean(busy)} onClick={() => act({ run_usage: true }, "usage")}>{busy === "usage" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Run minute billing</button>
        <button className={btn} disabled={Boolean(busy)} onClick={() => act({ run_checkins: true }, "checkins")}>{busy === "checkins" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send due check-ins</button>
        {d?.pending_voice?.length > 0 && <button className={btn} disabled={Boolean(busy)} onClick={() => act({ run_voice_retry: true }, "voice")}>{busy === "voice" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Retry {d.pending_voice.length} voice line{d.pending_voice.length === 1 ? "" : "s"}</button>}
        <button className={btn} disabled={Boolean(busy)} onClick={() => act({ run_audits: true }, "audits")}>{busy === "audits" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Run due monthly audits</button>
      </div>
      {err && <div className="text-sm text-[#D96B43]">{err}</div>}
      {d && !d.plans?.length && <div className="text-sm text-[#9E9AA3]">No subscribers yet. The offer shows on every audit report page.</div>}
      {d?.plans?.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]"><th className="font-normal pb-2 pr-3">Since</th><th className="font-normal pr-3">Business</th><th className="font-normal pr-3">Contact</th><th className="font-normal pr-3">Status</th><th className="font-normal pr-3">Minutes</th><th className="font-normal pr-3">Score</th><th className="font-normal pr-3">Next audit</th><th className="font-normal pr-3">Setup</th><th className="font-normal">Links</th></tr></thead>
          <tbody>{d.plans.map((p) => (
            <tr key={p.id} className="border-t border-white/8 align-top">
              <td className="py-2 pr-3 whitespace-nowrap text-[#9E9AA3]">{fmt(p.created_at)}</td>
              <td className="py-2 pr-3">{p.business}<div className="text-[10px] text-[#9E9AA3]">{p.tenant_id} · {p.interval || "month"}</div></td>
              <td className="py-2 pr-3 max-w-[220px] truncate">{p.name} · {p.email}{p.phone ? ` · ${p.phone}` : ""}</td>
              <td className="py-2 pr-3" style={{ color: COLOR[p.status] || "#F5F3EF" }}>{p.status}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{p.usage ? <span style={{ color: p.usage.minutes > p.usage.included ? "#E5A93C" : p.usage.pct >= 80 ? "#D96B43" : "#F5F3EF" }}>{p.usage.minutes}/{p.usage.included}{p.usage.overage ? ` (+${p.usage.overage}${p.usage.trialing ? " trial" : ` = $${p.usage.overage_usd}`})` : ""}</span> : "—"}{p.usage?.trialing ? <div className="text-[10px] text-[#9E9AA3]">trialing</div> : null}{d.pending_voice?.includes(p.id) ? <div className="text-[10px] text-[#E5A93C]">no number yet · retrying</div> : null}</td>
              <td className="py-2 pr-3">{p.last_score ?? "—"}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{fmt(p.next_audit_at)} <button className="text-xs text-[#E5A93C] ml-1" disabled={Boolean(busy)} onClick={() => act({ id: p.id, run_audit: true }, p.id)}>run</button></td>
              <td className="py-2 pr-3">{p.onboarded ? "done" : <span className="text-[#E5A93C]">pending</span>}</td>
              <td className="py-2 whitespace-nowrap"><a className="text-[#E5A93C]" href={p.portal} target="_blank" rel="noreferrer">portal</a>{p.stripe_customer ? <> · <a className="text-[#E5A93C]" href={`https://dashboard.stripe.com/customers/${p.stripe_customer}`} target="_blank" rel="noreferrer">stripe</a></> : null}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
