// Google PageSpeed Insights (Lighthouse, mobile) for the Pro audit.
// Free API. Without a key Google allows a small anonymous quota; with PSI_API_KEY
// (enable "PageSpeed Insights API" in the same Google Cloud project) it's 25,000/day.
// A run takes 15–40 s, so it is never awaited in the request path: run.js kicks it
// off with waitUntil() and stores the result on the audit row (extras_json.pagespeed).

const CATS = ["performance", "seo", "accessibility", "best-practices"];

export async function pageSpeed(env, url) {
  if (!url) return null;
  if (env.PSI_DISABLED === "1") return null;
  const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  u.searchParams.set("url", url);
  u.searchParams.set("strategy", "mobile");
  for (const c of CATS) u.searchParams.append("category", c);
  if (env.PSI_API_KEY) u.searchParams.set("key", env.PSI_API_KEY);
  const t0 = Date.now();
  let res;
  try { res = await fetch(u.toString(), { signal: AbortSignal.timeout(55000) }); }
  catch (e) { return { ok: false, error: e?.name === "TimeoutError" ? "PageSpeed timed out" : "PageSpeed unreachable", ms: Date.now() - t0 }; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: String(data?.error?.message || `PageSpeed ${res.status}`).slice(0, 160), ms: Date.now() - t0 };
  const lh = data.lighthouseResult || {};
  const cat = (k) => { const s = lh.categories?.[k]?.score; return typeof s === "number" ? Math.round(s * 100) : null; };
  const audit = (k) => lh.audits?.[k];
  const num = (k) => { const v = audit(k)?.numericValue; return typeof v === "number" ? v : null; };
  const lcp = num("largest-contentful-paint"), cls = num("cumulative-layout-shift"), tbt = num("total-blocking-time"), fcp = num("first-contentful-paint");
  const bytes = num("total-byte-weight");
  const crux = data.loadingExperience?.overall_category || null; // FAST | AVERAGE | SLOW from real users, when Google has enough traffic data
  // The 5 most impactful opportunities, in plain words.
  const opps = Object.values(lh.audits || {})
    .filter((a) => a?.details?.type === "opportunity" && typeof a.numericValue === "number" && a.score != null && a.score < 0.9)
    .sort((a, b) => b.numericValue - a.numericValue)
    .slice(0, 5)
    .map((a) => ({ title: String(a.title || "").slice(0, 120), savingsMs: Math.round(a.numericValue) }));
  return {
    ok: true, ms: Date.now() - t0, strategy: "mobile", fetchedAt: Date.now(),
    performance: cat("performance"), seo: cat("seo"), accessibility: cat("accessibility"), bestPractices: cat("best-practices"),
    lcpMs: lcp != null ? Math.round(lcp) : null, fcpMs: fcp != null ? Math.round(fcp) : null, cls: cls != null ? Math.round(cls * 1000) / 1000 : null, tbtMs: tbt != null ? Math.round(tbt) : null,
    pageKB: bytes != null ? Math.round(bytes / 1024) : null, realUsers: crux, opportunities: opps,
  };
}

// Turn PSI numbers into the same check shape the rest of the audit uses (for the full checklist and plan).
export function pageSpeedChecks(ps) {
  if (!ps?.ok) return [];
  const checks = [];
  const add = (id, label, ok, points, max, detail, fix) => checks.push({ id, label, status: ok === true ? "pass" : ok === "warn" ? "warn" : "fail", points, max, detail, fix, area: "website" });
  if (ps.performance != null) add("psi_performance", "Mobile speed (Lighthouse)", ps.performance >= 70 ? true : ps.performance >= 45 ? "warn" : false, 0, 0,
    `Performance ${ps.performance}/100${ps.lcpMs ? ` · main content visible in ${(ps.lcpMs / 1000).toFixed(1)}s` : ""}${ps.realUsers ? ` · real users: ${ps.realUsers.toLowerCase()}` : ""}`,
    ps.opportunities?.length ? `Biggest wins: ${ps.opportunities.slice(0, 3).map((o) => o.title.toLowerCase()).join("; ")}.` : "Compress images, remove unused scripts, use a faster host.");
  if (ps.seo != null) add("psi_seo", "Technical SEO (Lighthouse)", ps.seo >= 90 ? true : ps.seo >= 70 ? "warn" : false, 0, 0, `SEO ${ps.seo}/100`, "Fix the technical SEO items Lighthouse lists: titles, descriptions, crawlability, link text, mobile tap targets.");
  if (ps.accessibility != null) add("psi_a11y", "Accessibility (Lighthouse)", ps.accessibility >= 90 ? true : ps.accessibility >= 70 ? "warn" : false, 0, 0, `Accessibility ${ps.accessibility}/100`, "Add image alt text, form labels and enough color contrast — it helps ranking and avoids ADA complaints.");
  if (ps.pageKB != null) add("psi_weight", "Page weight", ps.pageKB <= 2000 ? true : ps.pageKB <= 4000 ? "warn" : false, 0, 0, `${(ps.pageKB / 1024).toFixed(1)} MB home page`, "Resize and compress photos before uploading; most pages should be under 2 MB.");
  return checks;
}
