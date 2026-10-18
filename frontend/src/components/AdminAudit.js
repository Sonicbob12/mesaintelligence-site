import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// /admin → Local Discovery: run a full audit for a prospect (no limits) and see public audit leads.
const input = "w-full bg-transparent border border-white/12 px-4 py-3 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors";
const btn = "font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const fmt = (s) => (s ? new Date(s * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-");
const mark = { pass: "✓", warn: "!", fail: "✗" };
const markColor = { pass: "#8EA89D", warn: "#E5A93C", fail: "#D96B43" };

export default function AdminAudit({ call, enabled }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => call("/admin/audit").then((d) => setList(d.audits || [])).catch((e) => setErr(e.message)), [call]);
  useEffect(() => { load(); }, [load]);

  const go = async (body, kind) => {
    setBusy(kind); setErr("");
    try {
      const d = await call("/admin/audit", { method: "POST", body: JSON.stringify(body) });
      if (d.candidates) { setCands(d.candidates); setResult(null); }
      else { setResult(d); setCands(null); load(); }
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  return (
    <section className="border border-white/10 bg-[#14161A] p-6 space-y-5" data-testid="admin-audit">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Local Discovery</div>
      {!enabled && <p className="text-sm text-[#9E9AA3]">Add GOOGLE_PLACES_API_KEY in Cloudflare → Variables and Secrets, then redeploy.</p>}
      {enabled && (
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) go({ query: q.trim() }, "search"); }} className="flex flex-wrap gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Prospect name + city" className={`${input} max-w-md`} data-testid="admin-audit-query" />
          <button className={btn} disabled={busy === "search"}>{busy === "search" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Find</button>
        </form>
      )}
      {cands && (
        <div className="text-sm space-y-1">
          {cands.length === 0 && <div className="text-[#9E9AA3]">No matches.</div>}
          {cands.map((c) => (
            <button key={c.id} onClick={() => go({ place_id: c.id }, "run")} className="block text-left hover:text-[#E5A93C]">
              {c.name} <span className="text-[#9E9AA3]">· {c.type} · {c.address}</span>
            </button>
          ))}
        </div>
      )}
      {busy === "run" && <div className="text-sm text-[#9E9AA3] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running Pro audit + plan (15–25 s)…</div>}
      {busy === "unlock" && <div className="text-sm text-[#9E9AA3] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Unlocking Pro + emailing the report…</div>}
      {err && <div className="text-sm text-[#D96B43]">{err}</div>}

      {result && (
        <div className="border-t border-white/8 pt-5 space-y-5 text-sm" data-testid="admin-audit-result">
          {result.place ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1 items-baseline">
              <span className="font-display text-xl">{result.place.name}</span>
              <span className="text-[#9E9AA3]">{result.place.address}</span>
              {result.place.phone && <span>{result.place.phone}</span>}
              {result.place.mapsUri && <a className="text-[#E5A93C]" href={result.place.mapsUri} target="_blank" rel="noreferrer">Maps ↗</a>}
              {result.link && <a className="text-[#E5A93C]" href={result.link} target="_blank" rel="noreferrer">Report page ↗</a>}
            </div>
          ) : (
            <div className="text-[#9E9AA3] flex flex-wrap gap-x-4 gap-y-1 items-baseline">
              <span>Stored audit {result.id} · {result.query || ""} · {result.contact_name || "no contact"} {result.contact_email || ""} {result.pro ? "· PRO" : ""}</span>
              {result.link && <a className="text-[#E5A93C]" href={result.link} target="_blank" rel="noreferrer">Report page ↗</a>}
              {!result.pro && <button onClick={() => go({ audit_id: result.id, unlock: true }, "unlock")} className="text-[#E5A93C] hover:underline" disabled={busy === "unlock"}>Unlock Pro + email report</button>}
            </div>
          )}
          <div className="flex gap-8">
            <div><div className="text-4xl font-light">{result.score ?? result.data?.score}</div><div className="text-[#9E9AA3] text-xs">overall · {result.grade ?? result.data?.grade}</div></div>
            <div><div className="text-2xl font-light">{result.listingScore ?? result.data?.listingScore}</div><div className="text-[#9E9AA3] text-xs">listing</div></div>
            <div><div className="text-2xl font-light">{(result.hasWebsite ?? result.data?.hasWebsite) ? (result.websiteScore ?? result.data?.websiteScore) : "—"}</div><div className="text-[#9E9AA3] text-xs">website</div></div>
            {(result.visibility?.score ?? result.data?.visibilityScore) != null && <div><div className="text-2xl font-light">{result.visibility?.score ?? result.data?.visibilityScore}</div><div className="text-[#9E9AA3] text-xs">visibility</div></div>}
          </div>
          {(result.visibility?.queries || result.data?.ranks) && (
            <div className="text-[#9E9AA3]">{(result.visibility?.queries || result.data?.ranks).map((r) => <span key={r.id} className="mr-4">{r.position ? `#${r.position}` : "n/a"} <span className="text-[#F5F3EF]">{r.label}</span></span>)}</div>
          )}
          {result.pro?.duplicates?.length > 0 && <div className="text-[#D96B43]">{result.pro.duplicates.length} duplicate listing(s): {result.pro.duplicates.map((d) => d.address).join("; ")}</div>}
          {result.pro?.teardown?.theyHaveYouDont?.length > 0 && <div className="text-[#9E9AA3]">#1 ({result.pro.teardown.name}) has, prospect doesn't: <span className="text-[#F5F3EF]">{result.pro.teardown.theyHaveYouDont.join(", ")}</span></div>}
          {result.pro?.themes && <div className="text-[#9E9AA3]">Reviews — praise: <span className="text-[#F5F3EF]">{(result.pro.themes.praise || []).join("; ") || "—"}</span> · complaints: <span className="text-[#F5F3EF]">{(result.pro.themes.complaints || []).join("; ") || "—"}</span></div>}
          {result.history?.length > 1 && <div className="text-[#9E9AA3]">History: {result.history.map((h) => h.score).join(" → ")}</div>}
          {result.competitors?.rows && (
            <table className="w-full max-w-2xl">
              <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]"><th className="font-normal pb-1">Business</th><th className="font-normal">Rating</th><th className="font-normal">Reviews</th><th className="font-normal">Photos</th><th className="font-normal">Site</th></tr></thead>
              <tbody>{[...result.competitors.rows].sort((a, b) => b.reviewCount - a.reviewCount).map((r) => (
                <tr key={r.id} className={`border-t border-white/8 ${r.you ? "text-[#E5A93C]" : ""}`}><td className="py-1 pr-3">{r.you ? `${r.name} (prospect)` : r.name}</td><td>{r.rating ?? "—"}</td><td>{r.reviewCount}</td><td>{r.photoCount ?? "—"}</td><td>{r.hasWebsite ? "yes" : "no"}</td></tr>
              ))}</tbody>
            </table>
          )}
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Checks</div>
              {(result.listing ? [...result.listing, ...(result.website?.checks || [])] : result.data?.issues || []).map((c) => (
                <div key={c.id} className="flex gap-2 py-0.5"><span style={{ color: markColor[c.status] }}>{mark[c.status]}</span><span>{c.label}</span>{c.detail && <span className="text-[#9E9AA3]">— {c.detail}</span>}</div>
              ))}
              {result.website?.error && <div className="text-[#D96B43] mt-1">Website: {result.website.error}</div>}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Fix-it plan {result.plan?.source === "rules" ? "(rule-based)" : ""}</div>
              {!result.plan && <div className="text-[#9E9AA3]">Not generated yet.</div>}
              {result.plan?.headline && <p className="mb-2">{result.plan.headline}</p>}
              <ol className="list-decimal pl-5 space-y-2">{(result.plan?.fixes || []).map((f, i) => (
                <li key={i}><b className="font-normal">{f.title}</b> <span className="text-[#9E9AA3] text-xs">{f.impact}{f.effort ? ` · ${f.effort}` : ""}</span><div className="text-[#9E9AA3]">{f.why} {f.how}</div></li>
              ))}</ol>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-white/8 pt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Recent audits ({list.length})</div>
        {!list.length && <div className="text-sm text-[#9E9AA3]">none yet</div>}
        {list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]"><th className="font-normal pb-2 pr-4">When</th><th className="font-normal pr-4">Searched / business</th><th className="font-normal pr-4">Score</th><th className="font-normal pr-4">Contact</th><th className="font-normal pr-4">Via</th><th className="font-normal">Pro</th></tr></thead>
              <tbody>{list.map((a) => (
                <tr key={a.id} onClick={() => go({ audit_id: a.id }, "open")} className="border-t border-white/8 cursor-pointer hover:bg-white/[0.03]">
                  <td className="py-2 pr-4 whitespace-nowrap">{fmt(a.created_at)}</td>
                  <td className="py-2 pr-4 max-w-[240px] truncate">{a.business_name || a.query || "-"}</td>
                  <td className="py-2 pr-4">{a.score} {a.grade}</td>
                  <td className="py-2 pr-4 max-w-[260px] truncate">{a.contact_email ? `${a.contact_name} · ${a.contact_email}${a.contact_phone ? ` · ${a.contact_phone}` : ""}` : <span className="text-[#9E9AA3]">—</span>}</td>
                  <td className="py-2 pr-4">{a.source}</td>
                  <td className="py-2">{a.pro ? <span className="text-[#E5A93C]">PRO</span> : <span className="text-[#9E9AA3]">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
