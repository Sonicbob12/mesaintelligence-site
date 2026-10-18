// Local Discovery audit: score a business's Google listing, search visibility and website against
// nearby competitors, then (for the full report) have Claude turn the findings into a fix-it plan.
//
// Two depths:
//   runAudit()      free teaser — listing + website + "{trade} in {city}" rank (1 Google search, shared
//                   with the competitor table), ~9¢ of Google.
//   runProExtras()  the Pro report — 2 more search-rank queries, duplicate-listing check, website
//                   teardown of the #1 competitor, review themes (model), and PageSpeed in the background.
// Pricing is a switch, not code: AUDIT_PRO_MODE = "free" (founding period: an email unlocks Pro)
// or "paid" (Stripe Checkout unlocks Pro). Anything else = Pro off.

import { placeDetails, nearbyCompetitors, competitorCategory, visibilityQueries, searchRank, findDuplicates } from "./places.js";
import { checkWebsite } from "./website.js";
import { pageSpeed, pageSpeedChecks } from "./pagespeed.js";
import { runModelCollect } from "./anthropic.js";
import { hasDB, id, now, safeJSON } from "./db.js";

const GENERIC_TYPES = new Set(["establishment", "point_of_interest", "store", "service", "business", "premise"]);
const DAY = 86400000;
const CACHE_DAYS = 30; // Google allows caching Places content up to 30 days; after that we re-fetch.

export const proMode = (env) => (env.AUDIT_PRO_MODE === "paid" && env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID ? "paid" : env.AUDIT_PRO_MODE === "free" || env.AUDIT_PRO_MODE === "paid" ? "free" : "off");
export const proPrice = (env) => Number(env.AUDIT_PRO_PRICE_USD || 99);

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
export const grade = (n) => (n >= 85 ? "A" : n >= 70 ? "B" : n >= 55 ? "C" : n >= 40 ? "D" : "F");
const posScore = (p) => (p == null ? 0 : p <= 3 ? 100 : p <= 6 ? 75 : p <= 10 ? 50 : 25);

function listingChecks(p, comps) {
  const checks = [];
  const add = (id, label, ok, points, max, detail, fix) => checks.push({ id, label, status: ok === true ? "pass" : ok === "warn" ? "warn" : "fail", points, max, detail, fix });

  if (p.status !== "OPERATIONAL") {
    add("status", "Listing shows as open", false, 0, 0, `Google lists this business as ${p.status.replace(/_/g, " ").toLowerCase()}`, "If you're open, correct the status in Google Business Profile right away — Google hides closed listings.");
  }

  add("hours", "Business hours listed", p.hasHours, p.hasHours ? 12 : 0, 12, p.hasHours ? "Hours are on the listing" : "No hours on the listing",
    "Add regular hours (and holiday hours) in Google Business Profile — listings without hours get fewer calls and \"Is it open?\" filters skip them.");

  add("phone", "Phone number listed", Boolean(p.phone), p.phone ? 8 : 0, 8, p.phone || "No phone number", "Add a local phone number to the listing.");

  add("website_link", "Website linked", Boolean(p.website), p.website ? 10 : 0, 10, p.website ? p.website.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/$/, "") : "No website on the listing",
    "Link a website (even a one-page site) — it's a ranking signal and where people go to decide.");

  const r = p.rating;
  const rPts = r == null ? 0 : r >= 4.5 ? 15 : r >= 4.0 ? 10 : r >= 3.5 ? 5 : 0;
  add("rating", "Star rating", r == null ? false : r >= 4.5 ? true : r >= 4.0 ? "warn" : false, rPts, 15,
    r == null ? "No rating yet" : `${r.toFixed(1)} stars`,
    "Ask every happy customer for a review (text them the link right after the job) and reply to every negative review within a day.");

  const compMedian = median(comps.map((c) => c.reviewCount));
  let vPts, vOk, vDetail;
  if (compMedian != null && compMedian > 0) {
    const ratio = p.reviewCount / compMedian;
    vPts = ratio >= 1 ? 15 : ratio >= 0.5 ? 9 : ratio >= 0.2 ? 4 : 0;
    vOk = ratio >= 1 ? true : ratio >= 0.5 ? "warn" : false;
    vDetail = `${p.reviewCount} reviews vs. a local median of ${compMedian}`;
  } else {
    vPts = p.reviewCount >= 100 ? 15 : p.reviewCount >= 30 ? 9 : p.reviewCount >= 10 ? 4 : 0;
    vOk = p.reviewCount >= 100 ? true : p.reviewCount >= 30 ? "warn" : false;
    vDetail = `${p.reviewCount} reviews`;
  }
  add("review_volume", "Review count vs. competitors", vOk, vPts, 15, vDetail,
    "Set up an automatic review request after every job — review count is one of the strongest local ranking factors.");

  // Only scored when Google actually returned the data (it sometimes omits reviews/photos).
  if (p.reviews && p.reviews.length) {
    const newest = Math.max(0, ...p.reviews.map((x) => x.at || 0));
    const age = newest ? (Date.now() - newest) / DAY : Infinity;
    const recPts = age <= 30 ? 10 : age <= 90 ? 6 : age <= 365 ? 2 : 0;
    add("review_recency", "Recent reviews", age <= 30 ? true : age <= 90 ? "warn" : false, recPts, 10,
      newest ? `Newest review Google surfaced is ${Math.round(age)} days old` : "No dated reviews",
      "Keep a steady trickle of new reviews — Google and customers both weigh recency.");
    const low = p.reviews.filter((x) => typeof x.rating === "number" && x.rating <= 2).length;
    if (low) add("negative_reviews", "Negative reviews showing", low >= 2 ? false : "warn", 0, 0, `${low} of the ${p.reviews.length} reviews Google surfaces first ${low === 1 ? "is" : "are"} 1–2 stars`,
      "Reply to each one publicly (calm, specific, offer to make it right) — a thoughtful owner reply is read by every future customer.");
  }

  const ph = p.photoCount;
  if (ph != null) {
    add("photos", "Photos on the listing", ph >= 10 ? true : ph >= 5 ? "warn" : false, ph >= 10 ? 10 : ph >= 5 ? 6 : ph >= 1 ? 3 : 0, 10,
      ph >= 10 ? "10+ photos" : `${ph} photo${ph === 1 ? "" : "s"}`,
      "Upload real photos — storefront, team, trucks, finished work. Aim for 10+ and add a few every month.");
  }

  const specific = p.primaryType && !GENERIC_TYPES.has(p.primaryType);
  add("category", "Specific primary category", specific, specific ? 5 : 0, 5, p.typeLabel || p.primaryType || "No category",
    "Pick the most specific primary category (e.g. \"HVAC contractor\", not \"Contractor\") — it decides which searches you show up for.");

  return { checks, compMedian };
}

function competitorSummary(p, comps) {
  const all = [{ id: p.id, name: p.name, rating: p.rating, reviewCount: p.reviewCount, photoCount: p.photoCount, hasWebsite: Boolean(p.website), hasHours: p.hasHours, you: true }, ...comps];
  const byReviews = [...all].sort((a, b) => b.reviewCount - a.reviewCount);
  const byRating = [...all].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount);
  const medianReviews = median(comps.map((c) => c.reviewCount));
  const medianRating = (() => { const s = comps.map((c) => c.rating).filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; })();
  return {
    rows: all,
    count: all.length,
    rankByReviews: byReviews.findIndex((x) => x.you) + 1,
    rankByRating: byRating.findIndex((x) => x.you) + 1,
    medianReviews,
    medianRating,
    reviewsToMedian: medianReviews != null ? Math.max(0, medianReviews - p.reviewCount) : null,
    leader: byReviews.find((x) => !x.you) || null,
  };
}

// Visibility: how the business ranks for the searches customers actually type.
function visibilityBlock(ranks) {
  const rs = ranks.filter(Boolean);
  if (!rs.length) return null;
  const score = Math.round(rs.reduce((a, r) => a + posScore(r.position), 0) / rs.length);
  const primary = rs[0];
  const checks = rs.map((r) => ({
    id: `rank_${r.id}`, label: `Rank for "${r.label}"`,
    status: r.position != null && r.position <= 3 ? "pass" : r.position != null && r.position <= 10 ? "warn" : "fail",
    points: posScore(r.position), max: 100,
    detail: r.position ? `#${r.position} of ${r.results}${r.leader ? ` · #1 is ${r.leader.name} (${r.leader.reviewCount} reviews)` : ""}` : `Not in the top ${r.results || 20}`,
    fix: r.position != null && r.position <= 3 ? "Hold the spot: keep reviews and photos coming monthly." : "Close the gap with the #1: more reviews than them, the exact category, a service page that names this search, and consistent name/address/phone everywhere.",
  }));
  return { score, grade: grade(score), queries: rs, checks, primary };
}

function overall({ listingScore, websiteScore, visibility }) {
  return visibility ? Math.round(listingScore * 0.5 + websiteScore * 0.3 + visibility.score * 0.2) : Math.round(listingScore * 0.65 + websiteScore * 0.35);
}

function rankIssues(listing, siteChecks, vis, hasWebsite) {
  const issues = [
    ...listing.map((c) => ({ ...c, area: "listing" })),
    ...(siteChecks || []).map((c) => ({ ...c, area: "website" })),
    ...(vis?.checks || []).map((c) => ({ ...c, area: "visibility", max: 20, points: Math.round(c.points / 5) })),
  ]
    .filter((c) => c.status !== "pass")
    .map((c) => ({ ...c, weight: (c.max - c.points) * (c.area === "listing" ? 0.5 : c.area === "visibility" ? 1 : 0.3) + (c.id === "status" ? 100 : 0) + (c.id === "site_loads" ? 30 : 0) + (c.id === "negative_reviews" ? 6 : 0) }))
    .sort((a, b) => b.weight - a.weight);
  if (!hasWebsite) issues.unshift({ id: "no_website", area: "website", label: "No website", status: "fail", points: 0, max: 100, detail: "There's no website on the listing to check", fix: "Get a simple, fast, mobile site with your phone, hours, service area and a booking button — and link it from Google.", weight: 40 });
  return issues.map(({ weight, ...c }) => c);
}

// Runs the free audit live. Returns everything needed for display; nothing is persisted here.
export async function runAudit(env, placeId) {
  const place = await placeDetails(env, placeId);
  const [compRes, site] = await Promise.all([
    nearbyCompetitors(env, place, 5).catch((e) => { console.error("competitors", e?.message || e); return { comps: [], rank: null }; }),
    place.website ? checkWebsite(place.website, place.phone, { allowLocal: env.AUDIT_ALLOW_LOCAL_SITES === "1", address: place.address }).catch(() => ({ ok: false, checks: [], score: 0, error: "Could not be checked" })) : Promise.resolve(null),
  ]);
  const comps = compRes.comps;
  const { checks } = listingChecks(place, comps);
  const lGot = checks.reduce((a, c) => a + c.points, 0), lMax = checks.reduce((a, c) => a + c.max, 0);
  const listingScore = Math.round((lGot / lMax) * 100);
  const websiteScore = site ? site.score : 0;
  const visibility = visibilityBlock([compRes.rank]);
  const score = overall({ listingScore, websiteScore, visibility });
  const competitors = competitorSummary(place, comps);
  const issues = rankIssues(checks, site?.checks, visibility, Boolean(place.website));

  return {
    place: {
      id: place.id, name: place.name, address: place.address, city: place.city, mapsUri: place.mapsUri,
      typeLabel: place.typeLabel, category: competitorCategory(place), rating: place.rating, reviewCount: place.reviewCount, photoCount: place.photoCount,
      phone: place.phone, website: place.website, hours: place.hours, status: place.status,
    },
    score, grade: grade(score), listingScore, websiteScore, hasWebsite: Boolean(place.website),
    visibility,
    listing: checks,
    website: site ? { ok: site.ok, url: site.finalUrl || site.url, ms: site.ms, error: site.error || null, checks: site.checks, extras: site.extras || null } : null,
    competitors,
    issues,
    pro: null,
    _reviews: place.reviews || null, // transient: used for review themes, never stored
    _location: place.location || null,
  };
}

// ---------------- Pro extras ----------------
// Runs the rest of the Google/website work and merges it into the audit. ~10 s wall time.
export async function runProExtras(env, audit) {
  const place = { id: audit.place.id, name: audit.place.name, city: audit.place.city, phone: audit.place.phone, location: audit._location, primaryType: "", typeLabel: audit.place.typeLabel, website: audit.place.website };
  const fakePlaceForCat = { ...place, primaryType: "x", typeLabel: audit.place.category };
  const qs = visibilityQueries(fakePlaceForCat).filter((q) => q.id !== "trade_city"); // trade_city came with the free run
  const leader = audit.competitors.leader;
  const leaderDetails = leader ? placeDetails(env, leader.id).catch(() => null) : Promise.resolve(null);

  const [ranks, dups, leaderPlace, themes] = await Promise.all([
    Promise.all(qs.map((q) => searchRank(env, place, q).catch((e) => { console.error("rank", q.id, e?.message || e); return null; }))),
    findDuplicates(env, place).catch((e) => { console.error("duplicates", e?.message || e); return []; }),
    leaderDetails,
    reviewThemes(env, audit).catch(() => null),
  ]);
  const leaderSite = leaderPlace?.website ? await checkWebsite(leaderPlace.website, leaderPlace.phone, { allowLocal: env.AUDIT_ALLOW_LOCAL_SITES === "1", address: leaderPlace.address }).catch(() => null) : null;

  const allRanks = [...(audit.visibility?.queries || []), ...ranks.filter(Boolean)];
  const visibility = visibilityBlock(allRanks);
  const teardown = leaderPlace ? {
    name: leaderPlace.name, rating: leaderPlace.rating, reviewCount: leaderPlace.reviewCount, photoCount: leaderPlace.photoCount, hasHours: leaderPlace.hasHours, website: leaderPlace.website || null,
    websiteScore: leaderSite ? leaderSite.score : null,
    // What they pass that you fail — the "here's what #1 does that you don't" list.
    theyHaveYouDont: leaderSite ? leaderSite.checks.filter((c) => c.status === "pass" && (audit.website?.checks || []).some((m) => m.id === c.id && m.status !== "pass")).map((c) => c.label) : [],
    youHaveTheyDont: leaderSite ? (audit.website?.checks || []).filter((c) => c.status === "pass" && leaderSite.checks.some((m) => m.id === c.id && m.status !== "pass")).map((c) => c.label) : [],
    tools: leaderSite?.extras?.tools || [], pages: leaderSite?.extras?.depth?.pages ?? null,
  } : null;

  const dupChecks = dups.length ? [{ id: "duplicates", label: "Duplicate or conflicting listings", status: dups.some((d) => d.samePhone) ? "fail" : "warn", points: 0, max: 0, area: "listing",
    detail: `${dups.length} other listing${dups.length === 1 ? "" : "s"} with your name${dups.some((d) => d.samePhone) ? " or phone number" : ""} nearby (${dups.slice(0, 2).map((d) => d.address.split(",")[0]).join("; ")})`,
    fix: "Claim and merge or close duplicates in Google Business Profile so reviews and ranking signals land on one profile." }] : [];

  const score = overall({ listingScore: audit.listingScore, websiteScore: audit.websiteScore, visibility });
  const pro = { visibility, duplicates: dups, teardown, themes, ranAt: Date.now(), pagespeed: audit.pro?.pagespeed || null };
  const issues = rankIssues([...audit.listing, ...dupChecks], audit.website?.checks, visibility, audit.hasWebsite);
  return { ...audit, score, grade: grade(score), visibility, issues, pro };
}

// What customers keep saying — derived from the handful of reviews Google surfaces. Text is not stored.
async function reviewThemes(env, audit) {
  const rs = (audit._reviews || []).filter((r) => r.text && r.text.length > 20);
  if (!env.ANTHROPIC_API_KEY || rs.length < 2) return null;
  const system = "You summarize customer reviews for a local business owner. Respond with JSON only: {\"praise\": [\"up to 3 short phrases customers praise\"], \"complaints\": [\"up to 3 short phrases customers complain about\"], \"quote\": \"one short, positive customer phrase worth putting on the website (paraphrase, max 12 words)\"}. Use only what the reviews say. Empty arrays are fine.";
  const { text } = await runModelCollect({ env, system, messages: [{ role: "user", content: rs.map((r, i) => `Review ${i + 1} (${r.rating}★): ${r.text}`).join("\n\n") }], maxTokens: 400 });
  const m = /\{[\s\S]*\}/.exec(text);
  const j = m ? JSON.parse(m[0]) : null;
  if (!j) return null;
  const arr = (x) => (Array.isArray(x) ? x.slice(0, 3).map((s) => String(s).slice(0, 80)) : []);
  return { praise: arr(j.praise), complaints: arr(j.complaints), quote: String(j.quote || "").slice(0, 120), sample: rs.length };
}

export async function runPageSpeed(env, auditId, url) {
  const ps = await pageSpeed(env, url).catch((e) => ({ ok: false, error: String(e?.message || e).slice(0, 120) }));
  if (!ps || !hasDB(env)) return ps;
  const row = await loadAudit(env, auditId);
  if (!row) return ps;
  const full = row.full || null;
  if (full) {
    full.pro = { ...(full.pro || {}), pagespeed: ps };
    if (ps.ok) {
      const extra = pageSpeedChecks(ps);
      full.website = full.website ? { ...full.website, checks: [...full.website.checks.filter((c) => !c.id.startsWith("psi_")), ...extra] } : full.website;
    }
    await env.DB.prepare("UPDATE audits SET full_json = ?2 WHERE id = ?1").bind(auditId, JSON.stringify(full)).run();
  }
  const data = row.data || {};
  data.pagespeed = ps.ok ? { performance: ps.performance, seo: ps.seo, accessibility: ps.accessibility, lcpMs: ps.lcpMs } : { error: ps.error };
  await env.DB.prepare("UPDATE audits SET data_json = ?2 WHERE id = ?1").bind(auditId, JSON.stringify(data)).run();
  return ps;
}

// The parts we keep long-term (our own derived findings — no Google content beyond the place id).
export function derived(a) {
  return {
    score: a.score, grade: a.grade, listingScore: a.listingScore, websiteScore: a.websiteScore, hasWebsite: a.hasWebsite,
    visibilityScore: a.visibility?.score ?? null,
    ranks: (a.visibility?.queries || []).map((q) => ({ id: q.id, label: q.label, position: q.position })),
    issues: a.issues.map((c) => ({ id: c.id, area: c.area, label: c.label, status: c.status, fix: c.fix })),
    competitors: { count: a.competitors.count, rankByReviews: a.competitors.rankByReviews, rankByRating: a.competitors.rankByRating, reviewsToMedian: a.competitors.reviewsToMedian },
    duplicates: a.pro?.duplicates?.length ?? null,
    themes: a.pro?.themes || null,
    teardown: a.pro?.teardown ? { websiteScore: a.pro.teardown.websiteScore, theyHaveYouDont: a.pro.teardown.theyHaveYouDont, youHaveTheyDont: a.pro.teardown.youHaveTheyDont } : null,
    pagespeed: a.pro?.pagespeed?.ok ? { performance: a.pro.pagespeed.performance, seo: a.pro.pagespeed.seo, accessibility: a.pro.pagespeed.accessibility, lcpMs: a.pro.pagespeed.lcpMs } : null,
    facts: factsFor(a),
  };
}

// Strip transient fields before caching the full audit for the report page (30-day cache, then re-fetched).
export function cacheable(a) {
  const { _reviews, _location, ...rest } = a;
  return rest;
}

// ---------------- fix-it plan ----------------
export function factsFor(a) {
  return {
    business_type: a.place.category || a.place.typeLabel || "local business",
    city: a.place.city,
    overall_score: a.score, listing_score: a.listingScore, website_score: a.hasWebsite ? a.websiteScore : "no website",
    visibility: a.visibility ? { score: a.visibility.score, ranks: a.visibility.queries.map((q) => `${q.position ? `#${q.position}` : "not in top 20"} for "${q.label}"${q.leader ? ` (leader: ${q.leader.reviewCount} reviews)` : ""}`) } : undefined,
    rating: a.place.rating, reviews: a.place.reviewCount, photos: a.place.photoCount,
    competitors: { count: a.competitors.count - 1, median_reviews: a.competitors.medianReviews, median_rating: a.competitors.medianRating, rank_by_reviews: `${a.competitors.rankByReviews} of ${a.competitors.count}`, reviews_needed_to_reach_median: a.competitors.reviewsToMedian },
    duplicates: a.pro?.duplicates?.length || undefined,
    top_competitor_has_that_you_dont: a.pro?.teardown?.theyHaveYouDont?.length ? a.pro.teardown.theyHaveYouDont : undefined,
    customers_praise: a.pro?.themes?.praise?.length ? a.pro.themes.praise : undefined,
    customers_complain_about: a.pro?.themes?.complaints?.length ? a.pro.themes.complaints : undefined,
    website_tools_found: a.website?.extras?.tools?.length ? a.website.extras.tools : undefined,
    problems: a.issues.slice(0, 12).map((c) => ({ area: c.area, check: c.label, finding: c.detail, standard_fix: c.fix })),
  };
}

// Works from the stored facts so the plan can be (re)built without calling Google again.
export async function actionPlan(env, facts, { pro = false } = {}) {
  const system = [
    "You are a local-SEO and small-business operations consultant at Mesa Intelligence, a Las Cruces/El Paso firm that builds practical AI for local businesses.",
    "Turn an audit of a business's Google listing, search visibility and website into a prioritized fix-it plan the owner can act on.",
    "Rules: Use only the facts given; never invent numbers. Plain language, no jargon, no markdown. Be specific to the business type and city.",
    pro ? "This is the paid Pro report: 6 to 8 fixes, each with concrete step-by-step 'how' (2-4 sentences), and a 30-day order of operations. If customers_praise is given, suggest using it on the website/listing; if customers_complain_about is given, address it operationally."
        : "Order by impact on calls and bookings. 4 to 6 fixes. Most fixes are things the owner can do themselves for free; say so.",
    "At most one fix may mention that Mesa Intelligence can help, and only where it truly fits (e.g. automatic review requests, answering missed calls, online booking). No hard sell.",
    'Respond with JSON only, exactly this shape: {"headline": "one sentence on the biggest opportunity", "fixes": [{"title": "short imperative", "why": "one sentence tied to their numbers", "how": "concrete sentences", "impact": "high|medium|low", "effort": "e.g. 15 minutes", "diy": true}]' + (pro ? ', "thirty_days": ["week 1: ...", "week 2: ...", "week 3: ...", "week 4: ..."]' : "") + "}",
  ].join("\n");
  try {
    if (!env.ANTHROPIC_API_KEY) throw new Error("no model");
    const { text } = await runModelCollect({ env, system, messages: [{ role: "user", content: `Audit facts:\n${JSON.stringify(facts, null, 1)}` }], maxTokens: pro ? 2500 : 1500 });
    const m = /\{[\s\S]*\}/.exec(text);
    const plan = m ? JSON.parse(m[0]) : null;
    if (plan?.fixes?.length) {
      return {
        source: "ai", pro,
        headline: String(plan.headline || "").slice(0, 300),
        fixes: plan.fixes.slice(0, pro ? 8 : 6).map((f) => ({
          title: String(f.title || "").slice(0, 120), why: String(f.why || "").slice(0, 400), how: String(f.how || "").slice(0, pro ? 900 : 600),
          impact: ["high", "medium", "low"].includes(f.impact) ? f.impact : "medium", effort: String(f.effort || "").slice(0, 40), diy: f.diy !== false,
        })),
        thirtyDays: Array.isArray(plan.thirty_days) ? plan.thirty_days.slice(0, 4).map((s) => String(s).slice(0, 300)) : undefined,
      };
    }
  } catch (e) { console.error("action plan", e?.message || e); }
  return fallbackPlan(facts);
}

function fallbackPlan(facts) {
  const probs = facts.problems || [];
  return {
    source: "rules",
    headline: probs.length ? `Fixing "${probs[0].check.toLowerCase()}" is the quickest win.` : "Your listing is in good shape — keep the reviews coming.",
    fixes: probs.slice(0, 6).map((c, i) => ({ title: c.check, why: c.finding, how: c.standard_fix, impact: i < 2 ? "high" : i < 4 ? "medium" : "low", effort: "", diy: true })),
  };
}

export async function savePlan(env, auditId, plan) {
  if (!hasDB(env)) return;
  await env.DB.prepare("UPDATE audits SET plan_json = ?2 WHERE id = ?1").bind(auditId, JSON.stringify(plan)).run();
}

// ---------------- storage ----------------
export async function saveAudit(env, rec) {
  const row = { id: rec.id || id("au"), created_at: now(), share_key: id("k").slice(2, 18), ...rec };
  if (!hasDB(env)) return row;
  await env.DB.prepare(
    `INSERT INTO audits (id, place_id, query, source, score, grade, data_json, ip, created_at, share_key, full_json, expires_at, pro)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
  ).bind(row.id, row.place_id, row.query || null, row.source || "public", row.score, row.grade, JSON.stringify(row.data || {}), row.ip || null, row.created_at,
    row.share_key, row.full ? JSON.stringify(row.full) : null, row.full ? row.created_at + CACHE_DAYS * 86400 : null, row.pro ? 1 : 0).run();
  if (row.plan) await savePlan(env, row.id, row.plan);
  await recordHistory(env, row);
  return row;
}

export async function updateAudit(env, auditId, { full, data, pro, plan }) {
  if (!hasDB(env)) return;
  const sets = [], binds = [auditId];
  const push = (sql, v) => { binds.push(v); sets.push(`${sql} = ?${binds.length}`); };
  if (full) { push("full_json", JSON.stringify(full)); push("expires_at", now() + CACHE_DAYS * 86400); }
  if (data) push("data_json", JSON.stringify(data));
  if (pro != null) { push("pro", pro ? 1 : 0); if (pro) push("pro_at", now()); }
  if (plan) push("plan_json", JSON.stringify(plan));
  if (!sets.length) return;
  await env.DB.prepare(`UPDATE audits SET ${sets.join(", ")} WHERE id = ?1`).bind(...binds).run();
}

export async function loadAudit(env, auditId) {
  if (!hasDB(env) || !auditId) return null;
  const row = await env.DB.prepare("SELECT * FROM audits WHERE id = ?").bind(auditId).first();
  if (!row) return null;
  const expired = row.expires_at && row.expires_at < now();
  return { ...row, data: safeJSON(row.data_json, {}), plan: safeJSON(row.plan_json, null), full: expired ? null : safeJSON(row.full_json, null), pro: Boolean(row.pro) };
}

export async function attachContact(env, auditId, c, plan) {
  if (!hasDB(env)) return;
  await env.DB.prepare(
    "UPDATE audits SET contact_name = ?2, contact_email = ?3, contact_phone = ?4, business_name = ?5, plan_json = COALESCE(?6, plan_json), reported_at = ?7 WHERE id = ?1"
  ).bind(auditId, c.name, c.email, c.phone || null, c.business || null, plan ? JSON.stringify(plan) : null, now()).run();
}

export async function recentAudits(env, limit = 50) {
  if (!hasDB(env)) return [];
  const { results } = await env.DB.prepare(
    "SELECT id, place_id, query, source, score, grade, pro, pro_at, share_key, contact_name, contact_email, contact_phone, business_name, created_at, reported_at FROM audits ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all();
  return results || [];
}

// Score history per business — the trend line for re-audits and retainer clients.
export async function recordHistory(env, row) {
  if (!hasDB(env)) return;
  const d = row.data || {};
  try {
    await env.DB.prepare("INSERT INTO audit_history (id, place_id, audit_id, score, grade, listing_score, website_score, visibility_score, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
      .bind(id("h"), row.place_id, row.id, row.score, row.grade, d.listingScore ?? null, d.websiteScore ?? null, d.visibilityScore ?? null, row.created_at || now()).run();
  } catch (e) { console.error("history", e?.message || e); }
}

export async function historyFor(env, placeId, limit = 24) {
  if (!hasDB(env) || !placeId) return [];
  try {
    const { results } = await env.DB.prepare("SELECT score, grade, listing_score, website_score, visibility_score, at, audit_id FROM audit_history WHERE place_id = ? ORDER BY at ASC LIMIT ?").bind(placeId, limit).all();
    return results || [];
  } catch { return []; }
}

export async function auditByStripeSession(env, sessionId) {
  if (!hasDB(env) || !sessionId) return null;
  const row = await env.DB.prepare("SELECT id FROM audits WHERE stripe_session = ?").bind(sessionId).first();
  return row ? loadAudit(env, row.id) : null;
}
