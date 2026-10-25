// Google Places API (New) client for the Local Discovery audit.
// Key: GOOGLE_PLACES_API_KEY (Cloudflare secret). PLACES_BASE_URL overrides the host for local tests.
//
// Billing tiers (first 1,000/month free on each Enterprise SKU):
//   searchCandidates  → Text Search Pro         (~$0.032)  name/address/type only
//   placeDetails      → Place Details Ent+Atmos (~$0.025)  rating, hours, website, reviews…
//   nearbyCompetitors → Text Search Enterprise  (~$0.035)  ratings/review counts of competitors
// Google's terms: don't store Places content except place IDs. The audit stores only
// our own derived scores/findings plus the place_id; names, ratings etc. are re-fetched.

const BASE = (env) => env.PLACES_BASE_URL || "https://places.googleapis.com";

async function places(env, method, path, body, fieldMask) {
  if (!env.GOOGLE_PLACES_API_KEY) { const e = new Error("GOOGLE_PLACES_API_KEY is not set"); e.status = 503; throw e; }
  const res = await fetch(`${BASE(env)}${path}`, {
    method,
    headers: { "content-type": "application/json", "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": fieldMask },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    console.error(`Places ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    const e = new Error(data?.error?.message || `Places API error ${res.status}`); e.status = res.status >= 500 ? 502 : res.status; throw e;
  }
  return data;
}

// Step 1: "Which one is you?" — up to 5 matches for a free-text business + city query.
export async function searchCandidates(env, query) {
  const data = await places(env, "POST", "/v1/places:searchText",
    { textQuery: query, pageSize: 5, regionCode: "us", languageCode: "en" },
    "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus");
  return (data.places || []).map((p) => ({
    id: p.id,
    name: p.displayName?.text || "",
    address: p.formattedAddress || "",
    type: p.primaryTypeDisplayName?.text || "",
    closed: p.businessStatus && p.businessStatus !== "OPERATIONAL",
  }));
}

const DETAIL_FIELDS = [
  "id", "displayName", "formattedAddress", "shortFormattedAddress", "addressComponents", "location", "businessStatus",
  "primaryType", "primaryTypeDisplayName", "types", "googleMapsUri",
  "nationalPhoneNumber", "websiteUri", "regularOpeningHours", "rating", "userRatingCount",
  "photos", "reviews", "editorialSummary",
].join(",");

// Step 2: the listing itself.
export async function placeDetails(env, placeId) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId || "")) { const e = new Error("Invalid place id"); e.status = 400; throw e; }
  const p = await places(env, "GET", `/v1/places/${encodeURIComponent(placeId)}`, null, DETAIL_FIELDS);
  const city = (p.addressComponents || []).find((c) => (c.types || []).includes("locality"))?.longText || "";
  // Google sometimes leaves photos/reviews out entirely; null = unknown (not scored), [] = none.
  // Review text is used only transiently (themes are derived by the model); it is never stored.
  const reviews = Array.isArray(p.reviews) ? p.reviews.map((r) => ({ rating: r.rating, at: r.publishTime ? Date.parse(r.publishTime) : null, text: String(r.text?.text || r.originalText?.text || "").slice(0, 600) })) : null;
  return {
    id: p.id,
    name: p.displayName?.text || "",
    address: p.formattedAddress || "",
    city,
    location: p.location || null,
    status: p.businessStatus || "OPERATIONAL",
    primaryType: p.primaryType || "",
    typeLabel: p.primaryTypeDisplayName?.text || "",
    types: p.types || [],
    mapsUri: p.googleMapsUri || "",
    phone: p.nationalPhoneNumber || "",
    website: p.websiteUri || "",
    hours: p.regularOpeningHours?.weekdayDescriptions || [],
    hasHours: Boolean(p.regularOpeningHours?.periods?.length),
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: p.userRatingCount || 0,
    photoCount: Array.isArray(p.photos) ? p.photos.length : null, // the API returns at most 10; null = not returned
    reviews,
    hasDescription: Boolean(p.editorialSummary?.text),
  };
}

// Step 3: who they're up against — same category, near the same spot.
// The same search doubles as the first visibility check ("{trade} in {city}"): the business's position
// in the full 20-result list is its rank. Returns { comps, rank }.
export async function nearbyCompetitors(env, place, max = 5) {
  if (!place.location) return { comps: [], rank: null };
  const what = competitorCategory(place);
  const label = `${what.toLowerCase()}${place.city ? ` in ${place.city}` : ""}`;
  const data = await places(env, "POST", "/v1/places:searchText", {
    textQuery: label,
    pageSize: 20,
    regionCode: "us",
    languageCode: "en",
    locationBias: { circle: { center: place.location, radius: 15000 } },
  }, "places.id,places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.regularOpeningHours,places.photos,places.googleMapsUri,places.businessStatus");
  const list = data.places || [];
  const idx = list.findIndex((p) => p.id === place.id);
  const top = list[0];
  const rank = { id: "trade_city", label, position: idx >= 0 ? idx + 1 : null, results: list.length,
    leader: top && top.id !== place.id ? { name: top.displayName?.text || "", rating: typeof top.rating === "number" ? top.rating : null, reviewCount: top.userRatingCount || 0 } : null };
  const comps = list
    .filter((p) => p.id !== place.id && (!p.businessStatus || p.businessStatus === "OPERATIONAL"))
    .slice(0, max)
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text || "",
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewCount: p.userRatingCount || 0,
      hasWebsite: Boolean(p.websiteUri),
      hasHours: Boolean(p.regularOpeningHours?.periods?.length),
      photoCount: Array.isArray(p.photos) ? p.photos.length : null,
      mapsUri: p.googleMapsUri || "",
    }));
  return { comps, rank };
}

// Google files many trades under broad types (an HVAC company is "General contractor"), which would
// pull builders as "competitors". When the type is broad, infer the trade from the business name.
const BROAD = new Set(["general_contractor", "establishment", "point_of_interest", "store", "service", "business", "premise", "home_goods_store"]);
const TRADES = [
  [/\b(hvac|heating|cooling|air\s*condition|a\/c|refrigeration|furnace|aire?\b|air\s)/i, "HVAC contractor"],
  [/\b(plumb|rooter|drain|sewer|water\s*heater)/i, "plumber"],
  [/\b(roof)/i, "roofing contractor"],
  [/\b(electric)/i, "electrician"],
  [/\b(landscap|lawn|tree\s*service|irrigation)/i, "landscaping company"],
  [/\b(pest|termite|exterminat)/i, "pest control service"],
  [/\b(solar)/i, "solar installer"],
  [/\b(pool|spa\s*service)/i, "pool service"],
  [/\b(concrete|paving|asphalt)/i, "concrete contractor"],
  [/\b(paint)/i, "painting contractor"],
  [/\b(garage\s*door)/i, "garage door service"],
  [/\b(clean|maid|janitorial)/i, "cleaning service"],
  [/\b(remodel|kitchen|bath)/i, "remodeling contractor"],
  [/\b(construct|builder|build|contracting)/i, "general contractor"],
];
export function competitorCategory(place) {
  if (place.categoryOverride) return place.categoryOverride;
  if (place.primaryType && !BROAD.has(place.primaryType)) return place.typeLabel || place.primaryType.replace(/_/g, " ");
  for (const [re, label] of TRADES) if (re.test(place.name)) return label;
  return place.typeLabel || "business";
}

// Step 4: search visibility — where does the business land for the searches people actually type?
// Each query is one Text Search (~$0.032); results are biased to the business's own location the
// way a phone search would be. Returns the 1-based position or null when it isn't in the top 20.
export function visibilityQueries(place) {
  const what = competitorCategory(place).toLowerCase();
  const city = place.city || "";
  const qs = [];
  if (city) qs.push({ id: "trade_city", label: `${what} in ${city}`, textQuery: `${what} in ${city}` });
  qs.push({ id: "near_me", label: `${what} near me`, textQuery: `${what} near me` });
  if (city) qs.push({ id: "best", label: `best ${what} ${city}`, textQuery: `best ${what} ${city}` });
  return qs.slice(0, 3);
}

export async function searchRank(env, place, q) {
  const data = await places(env, "POST", "/v1/places:searchText", {
    textQuery: q.textQuery, pageSize: 20, regionCode: "us", languageCode: "en",
    ...(place.location ? { locationBias: { circle: { center: place.location, radius: 8000 } } } : {}),
  }, "places.id,places.displayName,places.rating,places.userRatingCount");
  const list = data.places || [];
  const idx = list.findIndex((p) => p.id === place.id);
  const top = list[0];
  return {
    id: q.id, label: q.label,
    position: idx >= 0 ? idx + 1 : null,
    results: list.length,
    leader: top && top.id !== place.id ? { name: top.displayName?.text || "", rating: typeof top.rating === "number" ? top.rating : null, reviewCount: top.userRatingCount || 0 } : null,
  };
}

// Step 5: duplicate or conflicting listings — same name (or same phone) showing up more than once
// in the same city confuses Google and splits reviews between profiles.
export async function findDuplicates(env, place) {
  const q = `${place.name}${place.city ? ` ${place.city}` : ""}`;
  const data = await places(env, "POST", "/v1/places:searchText", {
    textQuery: q, pageSize: 10, regionCode: "us", languageCode: "en",
    ...(place.location ? { locationBias: { circle: { center: place.location, radius: 30000 } } } : {}),
  }, "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.businessStatus,places.userRatingCount");
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);
  const me = norm(place.name), myPhone = digits(place.phone);
  return (data.places || [])
    .filter((p) => p.id !== place.id)
    .filter((p) => {
      const n = norm(p.displayName?.text);
      const samePhone = myPhone && digits(p.nationalPhoneNumber) === myPhone;
      const sameName = n && me && (n === me || n.includes(me) || me.includes(n));
      return samePhone || sameName;
    })
    .slice(0, 5)
    .map((p) => ({ id: p.id, name: p.displayName?.text || "", address: p.formattedAddress || "", closed: p.businessStatus && p.businessStatus !== "OPERATIONAL", reviewCount: p.userRatingCount || 0, samePhone: Boolean(myPhone && digits(p.nationalPhoneNumber) === myPhone) }));
}

// Admin diagnostics: which fields Google actually returned for a place.
export async function placeRaw(env, placeId) {
  return places(env, "GET", `/v1/places/${encodeURIComponent(placeId)}`, null, "id,rating,userRatingCount,photos,reviews,primaryType,types");
}
