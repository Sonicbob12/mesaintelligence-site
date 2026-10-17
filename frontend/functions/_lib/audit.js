// Local Discovery audit: score a business's Google listing + website against nearby competitors,
// then (for the full report) have Claude turn the findings into a prioritized fix-it plan.

import { placeDetails, nearbyCompetitors, competitorCategory } from "./places.js";
import { checkWebsite } from "./website.js";
import { runModelCollect } from "./anthropic.js";
import { hasDB, id, now, safeJSON } from "./db.js";

const GENERIC_TYPES = new Set(["establishment", "point_of_interest", "store", "service", "business", "premise"]);
const DAY = 86400000;

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
export const grade = (n) => (n >= 85 ? "A" : n >= 70 ? "B" : n >= 55 ? "C" : n >= 40 ? "D" : "F");

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

// Runs the whole audit live. Returns everything needed for display; nothing is persisted here.
export async function runAudit(env, placeId) {
  const place = await placeDetails(env, placeId);
  const [comps, site] = await Promise.all([
    nearbyCompetitors(env, place).catch((e) => { console.error("competitors", e?.message || e); return []; }),
    place.website ? checkWebsite(place.website, place.phone, { allowLocal: env.AUDIT_ALLOW_LOCAL_SITES === "1" }).catch(() => ({ ok: false, checks: [], score: 0, error: "Could not be checked" })) : Promise.resolve(null),
  ]);
  const { checks } = listingChecks(place, comps);
  const lGot = checks.reduce((a, c) => a + c.points, 0), lMax = checks.reduce((a, c) => a + c.max, 0);
  const listingScore = Math.round((lGot / lMax) * 100);
  const websiteScore = site ? site.score : 0;
  const score = Math.round(listingScore * 0.65 + websiteScore * 0.35);
  const competitors = competitorSummary(place, comps);

  const issues = [...checks.map((c) => ({ ...c, area: "listing" })), ...(site?.checks || []).map((c) => ({ ...c, area: "website" }))]
    .filter((c) => c.status !== "pass")
    .map((c) => ({ ...c, weight: (c.max - c.points) * (c.area === "listing" ? 0.65 : 0.35) + (c.id === "status" ? 100 : 0) + (c.id === "site_loads" ? 30 : 0) }))
    .sort((a, b) => b.weight - a.weight);
  if (!place.website) issues.unshift({ id: "no_website", area: "website", label: "No website", status: "fail", points: 0, max: 100, detail: "There's no website on the listing to check", fix: "Get a simple, fast, mobile site with your phone, hours, service area and a booking button — and link it from Google.", weight: 40 });

  return {
    place: {
      id: place.id, name: place.name, address: place.address, city: place.city, mapsUri: place.mapsUri,
      typeLabel: place.typeLabel, category: competitorCategory(place), rating: place.rating, reviewCount: place.reviewCount, photoCount: place.photoCount,
      phone: place.phone, website: place.website, hours: place.hours, status: place.status,
    },
    score, grade: grade(score), listingScore, websiteScore, hasWebsite: Boolean(place.website),
    listing: checks,
    website: site ? { ok: site.ok, url: site.finalUrl || site.url, ms: site.ms, error: site.error || null, checks: site.checks } : null,
    competitors,
    issues: issues.map(({ weight, ...c }) => c),
  };
}

// The parts we keep (our own derived findings — no Google content beyond the place id).
export function derived(a) {
  return {
    score: a.score, grade: a.grade, listingScore: a.listingScore, websiteScore: a.websiteScore, hasWebsite: a.hasWebsite,
    issues: a.issues.map((c) => ({ id: c.id, area: c.area, label: c.label, status: c.status, fix: c.fix })),
    competitors: { count: a.competitors.count, rankByReviews: a.competitors.rankByReviews, rankByRating: a.competitors.rankByRating, reviewsToMedian: a.competitors.reviewsToMedian },
    facts: factsFor(a),
  };
}

// ---------------- fix-it plan ----------------
export function factsFor(a) {
  return {
    business_type: a.place.category || a.place.typeLabel || "local business",
    city: a.place.city,
    overall_score: a.score, listing_score: a.listingScore, website_score: a.hasWebsite ? a.websiteScore : "no website",
    rating: a.place.rating, reviews: a.place.reviewCount, photos: a.place.photoCount,
    competitors: { count: a.competitors.count - 1, median_reviews: a.competitors.medianReviews, median_rating: a.competitors.medianRating, rank_by_reviews: `${a.competitors.rankByReviews} of ${a.competitors.count}`, reviews_needed_to_reach_median: a.competitors.reviewsToMedian },
    problems: a.issues.slice(0, 10).map((c) => ({ area: c.area, check: c.label, finding: c.detail, standard_fix: c.fix })),
  };
}

// Works from the stored facts so the plan can be (re)built without calling Google again.
export async function actionPlan(env, facts) {
  const system = [
    "You are a local-SEO and small-business operations consultant at Mesa Intelligence, a Las Cruces/El Paso firm that builds practical AI for local businesses.",
    "Turn an audit of a business's Google listing and website into a short, prioritized fix-it plan the owner can act on this week.",
    "Rules: Use only the facts given; never invent numbers. Plain language, no jargon, no markdown. Be specific to the business type.",
    "Order by impact on calls and bookings. 4 to 6 fixes. Most fixes are things the owner can do themselves for free; say so.",
    "At most one fix may mention that Mesa Intelligence can help, and only where it truly fits (e.g. automatic review requests, answering missed calls, online booking). No hard sell.",
    'Respond with JSON only, exactly this shape: {"headline": "one sentence on the biggest opportunity", "fixes": [{"title": "short imperative", "why": "one sentence tied to their numbers", "how": "1-2 concrete sentences", "impact": "high|medium|low", "effort": "e.g. 15 minutes", "diy": true}]}',
  ].join("\n");
  try {
    if (!env.ANTHROPIC_API_KEY) throw new Error("no model");
    const { text } = await runModelCollect({ env, system, messages: [{ role: "user", content: `Audit facts:\n${JSON.stringify(facts, null, 1)}` }], maxTokens: 1500 });
    const m = /\{[\s\S]*\}/.exec(text);
    const plan = m ? JSON.parse(m[0]) : null;
    if (plan?.fixes?.length) {
      return {
        source: "ai",
        headline: String(plan.headline || "").slice(0, 300),
        fixes: plan.fixes.slice(0, 6).map((f) => ({
          title: String(f.title || "").slice(0, 120), why: String(f.why || "").slice(0, 400), how: String(f.how || "").slice(0, 600),
          impact: ["high", "medium", "low"].includes(f.impact) ? f.impact : "medium", effort: String(f.effort || "").slice(0, 40), diy: f.diy !== false,
        })),
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
  if (!hasDB(env)) return { id: rec.id || id("au") };
  const row = { id: rec.id || id("au"), created_at: now(), ...rec };
  await env.DB.prepare(
    `INSERT INTO audits (id, place_id, query, source, score, grade, data_json, ip, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(row.id, row.place_id, row.query || null, row.source || "public", row.score, row.grade, JSON.stringify(row.data || {}), row.ip || null, row.created_at).run();
  if (row.plan) await savePlan(env, row.id, row.plan);
  return row;
}

export async function loadAudit(env, auditId) {
  if (!hasDB(env) || !auditId) return null;
  const row = await env.DB.prepare("SELECT * FROM audits WHERE id = ?").bind(auditId).first();
  return row ? { ...row, data: safeJSON(row.data_json, {}), plan: safeJSON(row.plan_json, null) } : null;
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
    "SELECT id, place_id, query, source, score, grade, contact_name, contact_email, contact_phone, business_name, created_at, reported_at FROM audits ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all();
  return results || [];
}
