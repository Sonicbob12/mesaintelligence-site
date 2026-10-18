// Quick website check for the Local Discovery audit: does the site linked from the
// Google listing load, work on a phone, and make it easy to call or book?
// One GET of the home page (8s timeout, first ~1.5 MB). No crawling.

const MAX_BYTES = 1_500_000;
const BOOK_RE = /\b(book(?:\s+now|\s+online|ing)?|schedule(?:\s+(?:service|now|online|an?\s+appointment))?|request\s+(?:service|an?\s+appointment|a\s+quote)|make\s+an?\s+appointment|reserv(?:e|ation)s?|get\s+a\s+quote)\b/i;
const SCHEMA_RE = /"@type"\s*:\s*\[?\s*"(LocalBusiness|HomeAndConstructionBusiness|HVACBusiness|Plumber|Electrician|RoofingContractor|GeneralContractor|Dentist|MedicalBusiness|Physician|LegalService|Attorney|Restaurant|FoodEstablishment|CafeOrCoffeeShop|AutoRepair|AutomotiveBusiness|HealthAndBeautySalon|BeautySalon|HairSalon|DaySpa|ProfessionalService|Store|LodgingBusiness|FinancialService|AccountingService|InsuranceAgency|RealEstateAgent|VeterinaryCare|ChildCare|SportsActivityLocation|EntertainmentBusiness)"/i;

export function normalizeUrl(raw, allowLocal = false) {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (allowLocal) return u.toString(); // local tests only (AUDIT_ALLOW_LOCAL_SITES=1)
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    return u.toString();
  } catch { return null; }
}

const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);

// Known online-booking / field-service tools and chat widgets. Seeing one on the page means the
// business already has a way to capture jobs 24/7; not seeing one is a concrete, sellable gap.
const BOOKING_TOOLS = [
  [/housecallpro|housecall\.pro/i, "Housecall Pro"], [/servicetitan/i, "ServiceTitan"], [/getjobber|jobber\.com/i, "Jobber"],
  [/calendly/i, "Calendly"], [/acuityscheduling|squarespacescheduling/i, "Acuity"], [/square(?:up)?\.com\/appointments|squareup\.com\/book/i, "Square Appointments"],
  [/vagaro/i, "Vagaro"], [/booksy/i, "Booksy"], [/mindbody/i, "Mindbody"], [/opentable/i, "OpenTable"], [/resy\.com/i, "Resy"], [/toasttab/i, "Toast"],
  [/zocdoc/i, "Zocdoc"], [/nexhealth/i, "NexHealth"], [/setmore/i, "Setmore"], [/simplybook/i, "SimplyBook"], [/schedulicity/i, "Schedulicity"],
  [/workiz/i, "Workiz"], [/fieldedge/i, "FieldEdge"], [/servicefusion/i, "Service Fusion"], [/podium/i, "Podium"], [/thryv/i, "Thryv"],
];
const CHAT_WIDGETS = [
  [/tawk\.to/i, "tawk.to"], [/intercom/i, "Intercom"], [/drift\.com|js\.driftt/i, "Drift"], [/tidio/i, "Tidio"], [/livechat/i, "LiveChat"], [/crisp\.chat/i, "Crisp"],
  [/hubspot.*messages|hs-scripts/i, "HubSpot chat"], [/podium.*widget/i, "Podium webchat"], [/birdeye/i, "Birdeye"], [/mesaintelligence\.ai\/widget/i, "Mesa agent"], [/zendesk.*widget|zdassets/i, "Zendesk"],
];
const SOCIALS = [[/facebook\.com\/(?!sharer)/i, "Facebook"], [/instagram\.com\//i, "Instagram"], [/youtube\.com\/|youtu\.be\//i, "YouTube"], [/tiktok\.com\//i, "TikTok"], [/linkedin\.com\//i, "LinkedIn"], [/yelp\.com\/biz/i, "Yelp"], [/nextdoor\.com/i, "Nextdoor"]];
const ANALYTICS = /googletagmanager\.com|google-analytics\.com|gtag\(|fbq\(|connect\.facebook\.net|clarity\.ms|hotjar/i;

async function fetchText(url, ms = 5000) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(ms), headers: { "user-agent": "Mozilla/5.0 (compatible; MesaAudit/1.0; +https://mesaintelligence.ai)" } });
    if (!res.ok) return null;
    const t = await res.text();
    return t.length > MAX_BYTES ? t.slice(0, MAX_BYTES) : t;
  } catch { return null; }
}

// How big is the site? Count URLs in sitemap.xml (or robots.txt → sitemap). Counts service/city pages
// by path hints. Returns null when no sitemap is reachable (not penalized — many small sites have none).
export async function siteDepth(finalUrl) {
  let origin; try { origin = new URL(finalUrl).origin; } catch { return null; }
  let xml = await fetchText(`${origin}/sitemap.xml`);
  if (!xml) {
    const robots = await fetchText(`${origin}/robots.txt`, 3000);
    const m = robots && /sitemap:\s*(\S+)/i.exec(robots);
    if (m) xml = await fetchText(m[1]);
  }
  if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) return null;
  // Sitemap index → read the first 3 child sitemaps.
  if (/<sitemapindex/i.test(xml)) {
    const kids = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, 3);
    const parts = await Promise.all(kids.map((u) => fetchText(u)));
    xml = parts.filter(Boolean).join("\n");
  }
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  const uniq = [...new Set(urls)];
  const servicePages = uniq.filter((u) => /\/(services?|service-area|areas?|locations?|what-we-do|repair|install|replacement|plumb|hvac|roof|electric|clean|landscap|dental|law|practice-areas)/i.test(u)).length;
  const cityPages = uniq.filter((u) => /\/(las-cruces|el-paso|albuquerque|santa-fe|[a-z]+-(nm|tx|az|co)\b|service-area|areas-we-serve|locations?\/)/i.test(u)).length;
  const blogPages = uniq.filter((u) => /\/(blog|news|articles?|posts?|resources)\//i.test(u)).length;
  return { pages: uniq.length, servicePages, cityPages, blogPages };
}

export async function checkWebsite(rawUrl, googlePhone, { allowLocal = false, address = "" } = {}) {
  const url = normalizeUrl(rawUrl, allowLocal);
  if (!url) return { ok: false, url: rawUrl, error: "Not a valid public web address", checks: [], score: 0 };

  const t0 = Date.now();
  let res, html = "", finalUrl = url, error = "";
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; MesaAudit/1.0; +https://mesaintelligence.ai)", accept: "text/html,*/*;q=0.5" },
    });
    finalUrl = res.url || url;
    const reader = res.body?.getReader();
    if (reader) {
      const dec = new TextDecoder(); let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length; html += dec.decode(value, { stream: true });
        if (got > MAX_BYTES) { try { await reader.cancel(); } catch {} break; }
      }
    }
  } catch (e) {
    error = e?.name === "TimeoutError" ? "Took longer than 8 seconds to respond" : "Could not be reached";
  }
  const ms = Date.now() - t0;
  const loaded = Boolean(res && res.status < 400 && html.length > 200);

  const checks = [];
  const add = (id, label, ok, points, max, detail, fix) => checks.push({ id, label, status: ok === true ? "pass" : ok === "warn" ? "warn" : "fail", points, max, detail, fix });

  add("site_loads", "Website loads", loaded, loaded ? 20 : 0, 20,
    loaded ? `Responded ${res.status}` : error || `Returned HTTP ${res?.status ?? "error"}`,
    "Fix the website link on Google, or get the site back online — a dead link costs the click and trust.");
  if (!loaded) return { ok: false, url, finalUrl, ms, error: error || `HTTP ${res?.status}`, checks, score: 0 };

  const https = finalUrl.startsWith("https://");
  add("https", "Secure (https)", https, https ? 10 : 0, 10, https ? "Served over https" : "Not secure — browsers show a warning", "Turn on SSL (usually free from your host) and redirect http to https.");

  const fast = ms < 1500 ? true : ms < 3000 ? "warn" : false;
  add("speed", "Responds quickly", fast, ms < 1500 ? 10 : ms < 3000 ? 5 : 0, 10, `First response in ${(ms / 1000).toFixed(1)}s`, "Compress images and use better hosting/caching — mobile visitors leave after ~3 seconds.");

  const viewport = /<meta[^>]+name=["']?viewport["']?[^>]*>/i.test(html);
  add("mobile", "Mobile-friendly setup", viewport, viewport ? 15 : 0, 15, viewport ? "Has a mobile viewport tag" : "No mobile viewport tag — likely renders tiny on phones", "Use a responsive template; most local searches happen on a phone.");

  const title = (/<title[^>]*>([^<]{3,})<\/title>/i.exec(html)?.[1] || "").trim();
  const desc = /<meta[^>]+name=["']?description["']?[^>]+content=["'][^"']{20,}/i.test(html);
  add("title", "Page title", Boolean(title), title ? 5 : 0, 5, title ? `"${title.slice(0, 70)}"` : "Missing", "Give the home page a title with your service + city, e.g. \"AC Repair in Las Cruces | Name\".");
  add("meta_description", "Search description", desc, desc ? 5 : 0, 5, desc ? "Present" : "Missing", "Add a meta description — it's the text Google shows under your link.");

  const pageDigits = html.replace(/\D/g, " ");
  const gp = digits(googlePhone);
  const phoneMatch = gp ? pageDigits.includes(gp) || html.replace(/\D/g, "").includes(gp) : /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(html);
  add("phone_match", gp ? "Phone matches Google listing" : "Phone number on site", phoneMatch, phoneMatch ? 15 : 0, 15,
    phoneMatch ? (gp ? "Same number as Google" : "Phone number found") : gp ? "The Google number isn't on the home page" : "No phone number found",
    "Show the same phone number on the site as on Google — mismatches hurt local ranking and confuse callers.");

  const tel = /href=["']tel:/i.test(html);
  add("click_to_call", "Tap-to-call link", tel, tel ? 10 : 0, 10, tel ? "Has a tel: link" : "Phone number isn't tappable", "Wrap the phone number in a tel: link so mobile visitors can call in one tap.");

  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const booking = /<form[\s>]/i.test(html) || BOOK_RE.test(text);
  add("booking", "Way to book or request service", booking, booking ? 10 : 0, 10, booking ? "Has a form or booking call-to-action" : "No form or booking button found", "Add a \"Book / Request service\" button above the fold — or an AI agent that books 24/7.");

  const schema = /application\/ld\+json/i.test(html) && SCHEMA_RE.test(html);
  add("schema", "Local business markup", schema, schema ? 10 : 0, 10, schema ? "LocalBusiness structured data found" : "No LocalBusiness structured data", "Add LocalBusiness schema (name, address, phone, hours) so Google can match the site to your listing.");

  // ---- Pro-depth checks (also scored, smaller weights) ----
  // Address on the site matches Google (street number + street word is enough; suites and formatting vary).
  const addrKey = (() => { const m = /^(\d+)\s+([A-Za-z0-9.']+)/.exec(String(address || "").trim()); return m ? [m[1], m[2].toLowerCase().replace(/[.']/g, "")] : null; })();
  if (addrKey) {
    const plain = text.toLowerCase().replace(/[.']/g, "");
    const addrOk = plain.includes(addrKey[0]) && plain.includes(addrKey[1]);
    add("address_match", "Address matches Google listing", addrOk, addrOk ? 5 : 0, 5, addrOk ? "Street address found on the home page" : "The Google address isn't on the home page",
      "Put your full address (as written on Google) in the footer of every page — consistent name/address/phone is a core local ranking signal.");
  }

  const tools = BOOKING_TOOLS.filter(([re]) => re.test(html)).map(([, n]) => n);
  add("booking_tool", "Online booking tool", tools.length > 0 ? true : booking ? "warn" : false, tools.length ? 5 : booking ? 2 : 0, 5,
    tools.length ? `Uses ${[...new Set(tools)].slice(0, 2).join(", ")}` : booking ? "Has a form, but no real-time booking tool" : "No online booking found",
    "Let customers book or request a time without calling — a booking tool or an AI agent captures the after-hours jobs you're losing now.");

  const chats = CHAT_WIDGETS.filter(([re]) => re.test(html)).map(([, n]) => n);
  add("chat", "Chat or instant answers", chats.length > 0, chats.length ? 5 : 0, 5, chats.length ? `Has ${[...new Set(chats)][0]}` : "No chat widget — visitors with a question have to call or leave",
    "Add a chat that answers questions and books 24/7; most visitors won't fill out a form and wait.");

  const socials = [...new Set(SOCIALS.filter(([re]) => re.test(html)).map(([, n]) => n))];
  add("social", "Social profiles linked", socials.length >= 2 ? true : socials.length === 1 ? "warn" : false, socials.length >= 2 ? 3 : socials.length ? 2 : 0, 3,
    socials.length ? `Links to ${socials.slice(0, 3).join(", ")}` : "No social profiles linked", "Link your Facebook/Instagram from the site and keep them current — they rank for your name and feed reviews.");

  const analytics = ANALYTICS.test(html);
  add("analytics", "Tracking installed", analytics, analytics ? 2 : 0, 2, analytics ? "Analytics or pixel found" : "No analytics — you can't see where calls come from", "Install Google Analytics (free) so you know which pages and searches bring customers.");

  const depth = await siteDepth(finalUrl).catch(() => null);
  if (depth) {
    const ok = depth.pages >= 15 && depth.servicePages >= 3 ? true : depth.pages >= 6 ? "warn" : false;
    add("site_depth", "Site depth (service pages)", ok, ok === true ? 5 : ok === "warn" ? 3 : 1, 5,
      `${depth.pages} page${depth.pages === 1 ? "" : "s"} in the sitemap · ${depth.servicePages} service page${depth.servicePages === 1 ? "" : "s"}${depth.cityPages ? ` · ${depth.cityPages} area page${depth.cityPages === 1 ? "" : "s"}` : ""}${depth.blogPages ? ` · ${depth.blogPages} posts` : ""}`,
      "Give each main service its own page (and each town you serve) — one page per service is how small sites outrank bigger competitors for specific searches.");
  }

  const got = checks.reduce((a, c) => a + c.points, 0), max = checks.reduce((a, c) => a + c.max, 0);
  return { ok: true, url, finalUrl, ms, checks, score: Math.round((got / max) * 100), extras: { tools: [...new Set(tools)], chats: [...new Set(chats)], socials, analytics, depth, title } };
}
