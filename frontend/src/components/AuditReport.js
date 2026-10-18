import { Check, AlertTriangle, X, Star, Printer } from "lucide-react";

// Shared renderer for a Local Discovery audit — used inline on the homepage after the email gate,
// on the shareable /audit/:id page, and in /admin. `full` is the audit object from the API
// (place, scores, listing/website checks, competitors, visibility, pro extras); `plan` the fix-it plan.

export const gradeColor = (g) => ({ A: "#8EA89D", B: "#8EA89D", C: "#E5A93C", D: "#D96B43", F: "#D96B43" }[g] || "#9E9AA3");
const label = "font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]";
const card = "border border-white/10 bg-[#14161A] p-6 sm:p-8 print:border-black/20 print:bg-white";

export function Bar({ label: l, value }) {
  return (
    <div>
      <div className="flex justify-between mb-1"><span className="text-[#9E9AA3]">{l}</span><span>{value == null ? "none" : value}</span></div>
      <div className="h-1 bg-white/8"><div className="h-1 bg-[#D96B43]" style={{ width: `${value || 0}%` }} /></div>
    </div>
  );
}

export function CheckRow({ c, showFix }) {
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

function Tile({ n, l, big }) {
  return (
    <div className={`${big ? "" : "border border-white/10"} p-4 text-center min-w-[110px]`} style={big ? { background: "#0B0C0E" } : undefined}>
      <div className={`font-display font-light leading-none ${big ? "text-5xl" : "text-3xl"}`}>{n ?? "—"}</div>
      <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#9E9AA3] mt-2">{l}</div>
    </div>
  );
}

export function Ranks({ visibility }) {
  if (!visibility?.queries?.length) return null;
  return (
    <ul className="space-y-2 text-sm" data-testid="audit-ranks">
      {visibility.queries.map((q) => (
        <li key={q.id} className="flex flex-wrap gap-x-3 items-baseline">
          <span className={`font-display text-2xl font-light ${q.position && q.position <= 3 ? "text-[#8EA89D]" : q.position && q.position <= 10 ? "text-[#E5A93C]" : "text-[#D96B43]"}`}>{q.position ? `#${q.position}` : "—"}</span>
          <span>for “{q.label}”</span>
          <span className="text-[#9E9AA3]">{q.position ? `of ${q.results}` : `not in the top ${q.results || 20}`}{q.leader ? ` · #1 is ${q.leader.name} (${q.leader.reviewCount} reviews)` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

export function Competitors({ competitors, category }) {
  if (!competitors || competitors.count <= 1) return <p className="text-sm text-[#9E9AA3]">No close competitors came up nearby.</p>;
  const hasPhotos = competitors.rows.some((r) => r.photoCount != null);
  return (
    <>
      <table className="w-full text-sm" data-testid="audit-competitors">
        <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]"><th className="pb-2 font-normal">Business</th><th className="pb-2 font-normal">Rating</th><th className="pb-2 font-normal">Reviews</th>{hasPhotos && <th className="pb-2 font-normal">Photos</th>}<th className="pb-2 font-normal">Site</th></tr></thead>
        <tbody>
          {[...competitors.rows].sort((a, b) => b.reviewCount - a.reviewCount).map((r) => (
            <tr key={r.id} className={`border-t border-white/8 ${r.you ? "text-[#E5A93C]" : ""}`}>
              <td className="py-2 pr-4 max-w-[220px] truncate">{r.you ? "You" : r.name}</td>
              <td className="py-2 pr-4 whitespace-nowrap">{r.rating != null ? <span className="inline-flex items-center gap-1">{r.rating.toFixed(1)} <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} /></span> : "—"}</td>
              <td className="py-2 pr-4">{r.reviewCount}</td>
              {hasPhotos && <td className="py-2 pr-4">{r.photoCount == null ? "—" : r.photoCount >= 10 ? "10+" : r.photoCount}</td>}
              <td className="py-2">{r.hasWebsite ? "yes" : <span className="text-[#9E9AA3]">no</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-[#9E9AA3] mt-4">
        You're <span className="text-[#F5F3EF]">#{competitors.rankByReviews} of {competitors.count}</span> {category ? `${category.toLowerCase()}s` : "competitors"} by reviews
        {competitors.reviewsToMedian ? <> — about <span className="text-[#F5F3EF]">{competitors.reviewsToMedian} more</span> gets you to the local median</> : null}.
      </p>
    </>
  );
}

export function History({ history }) {
  const pts = (history || []).filter((h) => typeof h.score === "number");
  if (pts.length < 2) return null;
  const w = 320, h = 60, min = Math.min(...pts.map((p) => p.score)) - 5, max = Math.max(...pts.map((p) => p.score)) + 5;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * (w - 8) + 4, h - 4 - ((p.score - min) / (max - min || 1)) * (h - 8)]);
  return (
    <div data-testid="audit-history">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm h-16">
        <polyline fill="none" stroke="#D96B43" strokeWidth="1.5" points={xy.map((p) => p.join(",")).join(" ")} />
        {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#E5A93C" />)}
      </svg>
      <div className="text-xs text-[#9E9AA3]">{pts[0].score} → {pts[pts.length - 1].score} over {pts.length} audits ({new Date(pts[0].at * 1000).toLocaleDateString()} – {new Date(pts[pts.length - 1].at * 1000).toLocaleDateString()})</div>
    </div>
  );
}

export default function AuditReport({ full, plan, pro, history, link, showPrint = false, compact = false }) {
  if (!full) return null;
  const p = full.pro || {};
  const ps = p.pagespeed;
  const td = p.teardown;
  const th = p.themes;
  const dups = p.duplicates || [];
  const allChecks = [...(full.listing || []), ...(full.website?.checks || []), ...(full.visibility?.checks || [])];
  return (
    <div className="space-y-6 print:space-y-4 print:text-black" data-testid="audit-report">
      {!compact && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="font-display text-2xl font-light">{full.place?.name}</div>
          <div className="text-sm text-[#9E9AA3]">{full.place?.address}</div>
          {pro && <span className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border border-[#E5A93C] text-[#E5A93C]">Pro report</span>}
          {showPrint && <button onClick={() => window.print()} className="ml-auto text-xs text-[#9E9AA3] hover:text-[#E5A93C] flex items-center gap-1 print:hidden"><Printer className="w-3.5 h-3.5" /> Print / save as PDF</button>}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Tile n={full.score} l={`Overall · ${full.grade}`} big />
        <Tile n={full.listingScore} l="Google listing" />
        <Tile n={full.hasWebsite ? full.websiteScore : "—"} l="Website" />
        {full.visibility && <Tile n={full.visibility.score} l="Search visibility" />}
        {ps?.ok && <Tile n={ps.performance} l="Mobile speed" />}
      </div>

      {full.visibility && (
        <div className={card}>
          <div className={`${label} mb-4`}>Where you show up</div>
          <Ranks visibility={full.visibility} />
          {!pro && <p className="text-xs text-[#9E9AA3] mt-4">The Pro report checks two more searches people type ("near me" and "best …").</p>}
        </div>
      )}

      <div className={card}>
        <div className={`${label} mb-4`}>You vs. {full.competitors?.count - 1} nearby {(full.place?.category || full.place?.typeLabel || "competitor").toLowerCase()}s</div>
        <Competitors competitors={full.competitors} category={full.place?.category || full.place?.typeLabel} />
        <div className="text-[11px] text-[#9E9AA3]/70 mt-4">Google Maps</div>
      </div>

      {dups.length > 0 && (
        <div className="border border-[#D96B43]/50 bg-[#D96B43]/[0.05] p-6" data-testid="audit-duplicates">
          <div className={`${label} mb-2`} style={{ color: "#D96B43" }}>Duplicate or conflicting listings</div>
          <p className="text-sm">{dups.length} other listing{dups.length === 1 ? "" : "s"} with your name{dups.some((d) => d.samePhone) ? " or phone number" : ""} nearby. These split your reviews and confuse Google about which one is you.</p>
          <ul className="text-sm text-[#9E9AA3] mt-2 space-y-1">{dups.map((d) => <li key={d.id}>{d.name} · {d.address}{d.closed ? " · listed as closed" : ""}{d.reviewCount ? ` · ${d.reviewCount} reviews` : ""}</li>)}</ul>
        </div>
      )}

      {td && (
        <div className={card} data-testid="audit-teardown">
          <div className={`${label} mb-3`}>The #1 competitor's playbook: {td.name}</div>
          <p className="text-sm text-[#9E9AA3] mb-4">{td.rating ? `${td.rating.toFixed(1)} stars · ` : ""}{td.reviewCount} reviews{td.photoCount != null ? ` · ${td.photoCount >= 10 ? "10+" : td.photoCount} photos` : ""}{td.websiteScore != null ? ` · website scores ${td.websiteScore}` : td.website ? "" : " · no website"}{td.pages ? ` · ${td.pages}-page site` : ""}{td.tools?.length ? ` · books online with ${td.tools[0]}` : ""}</p>
          <div className="grid sm:grid-cols-2 gap-6 text-sm">
            <div><div className="text-[#D96B43] mb-2">They have, you don't</div>{td.theyHaveYouDont?.length ? <ul className="space-y-1">{td.theyHaveYouDont.map((x) => <li key={x}>✗ {x}</li>)}</ul> : <div className="text-[#9E9AA3]">Nothing on their site that yours lacks.</div>}</div>
            <div><div className="text-[#8EA89D] mb-2">You have, they don't</div>{td.youHaveTheyDont?.length ? <ul className="space-y-1">{td.youHaveTheyDont.map((x) => <li key={x}>✓ {x}</li>)}</ul> : <div className="text-[#9E9AA3]">—</div>}</div>
          </div>
        </div>
      )}

      {th && (th.praise?.length || th.complaints?.length) ? (
        <div className={card} data-testid="audit-themes">
          <div className={`${label} mb-3`}>What customers keep saying</div>
          <div className="grid sm:grid-cols-2 gap-6 text-sm">
            <div><div className="text-[#8EA89D] mb-2">Praise</div><ul className="space-y-1">{(th.praise || []).map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><div className="text-[#D96B43] mb-2">Complaints</div>{th.complaints?.length ? <ul className="space-y-1">{th.complaints.map((x) => <li key={x}>{x}</li>)}</ul> : <div className="text-[#9E9AA3]">None in the reviews we read.</div>}</div>
          </div>
          {th.quote && <p className="text-sm text-[#9E9AA3] mt-4">Worth putting on your website: <span className="text-[#F5F3EF]">“{th.quote}”</span></p>}
          <div className="text-[11px] text-[#9E9AA3]/70 mt-3">Based on the {th.sample} reviews Google surfaces first.</div>
        </div>
      ) : null}

      {ps && (
        <div className={card} data-testid="audit-pagespeed">
          <div className={`${label} mb-3`}>Google PageSpeed (mobile)</div>
          {ps.ok ? (
            <>
              <div className="flex flex-wrap gap-6 text-sm">
                {[["Performance", ps.performance], ["SEO", ps.seo], ["Accessibility", ps.accessibility], ["Best practices", ps.bestPractices]].map(([l, v]) => v != null && <div key={l}><span className="font-display text-3xl font-light" style={{ color: v >= 90 ? "#8EA89D" : v >= 50 ? "#E5A93C" : "#D96B43" }}>{v}</span><span className="text-[#9E9AA3] ml-2">{l}</span></div>)}
              </div>
              <p className="text-sm text-[#9E9AA3] mt-3">{ps.lcpMs ? `Main content visible in ${(ps.lcpMs / 1000).toFixed(1)}s` : ""}{ps.pageKB ? ` · ${(ps.pageKB / 1024).toFixed(1)} MB page` : ""}{ps.realUsers ? ` · real visitors rate it ${ps.realUsers.toLowerCase()}` : ""}</p>
              {ps.opportunities?.length > 0 && <ul className="text-sm mt-3 space-y-1">{ps.opportunities.slice(0, 4).map((o) => <li key={o.title}>• {o.title} <span className="text-[#9E9AA3]">(~{(o.savingsMs / 1000).toFixed(1)}s)</span></li>)}</ul>}
            </>
          ) : <p className="text-sm text-[#9E9AA3]">{ps.error || "Not available for this site."}</p>}
        </div>
      )}

      {plan && (
        <div className={card} data-testid="audit-plan">
          <div className={`${label} mb-3`}>Your fix-it plan</div>
          {plan.headline && <p className="font-display text-xl font-light mb-6">{plan.headline}</p>}
          <ol className="space-y-5">
            {plan.fixes.map((f, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-mono text-sm text-[#D96B43] w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="font-light">{f.title} <span className="text-xs text-[#9E9AA3] ml-2 uppercase tracking-wider">{f.impact} impact{f.effort ? ` · ${f.effort}` : ""}{f.diy === false ? " · needs a pro" : ""}</span></div>
                  <p className="text-sm text-[#9E9AA3] mt-1">{f.why}</p>
                  <p className="text-sm mt-1">{f.how}</p>
                </div>
              </li>
            ))}
          </ol>
          {plan.thirtyDays?.length > 0 && (
            <div className="mt-8 border-t border-white/8 pt-6">
              <div className={`${label} mb-3`}>Next 30 days</div>
              <ol className="space-y-2 text-sm">{plan.thirtyDays.map((s, i) => <li key={i} className="flex gap-3"><span className="text-[#E5A93C] font-mono text-xs mt-0.5">W{i + 1}</span><span>{s}</span></li>)}</ol>
            </div>
          )}
        </div>
      )}

      <div className={card}>
        <div className={`${label} mb-4`}>Everything we checked ({allChecks.length})</div>
        <div className="divide-y divide-white/8">{allChecks.map((c) => <CheckRow key={c.id} c={c} showFix={c.status !== "pass"} />)}</div>
        {full.website?.error && <p className="text-sm text-[#D96B43] mt-3">Website: {full.website.error}</p>}
      </div>

      {history?.length > 1 && (
        <div className={card}><div className={`${label} mb-3`}>Score over time</div><History history={history} /></div>
      )}

      {link && <p className="text-sm text-[#9E9AA3] print:hidden">Shareable link: <a href={link} className="text-[#E5A93C] break-all">{link}</a></p>}
      <p className="text-[11px] text-[#9E9AA3]/60">Listing data from Google Maps. Scores are Mesa Intelligence's assessment, not Google's.</p>
    </div>
  );
}
