// Generates the static SEO landing pages, sitemap.xml and robots.txt into public/.
//   node scripts/seo/build.mjs
// Static HTML (no React) so search engines read the full content on the first request.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, PAGES } from "./pages.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, "..", "..", "public");
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ORG = {
  "@type": "ProfessionalService",
  "@id": `${SITE.url}/#business`,
  name: SITE.name,
  legalName: SITE.legal,
  url: SITE.url,
  email: SITE.email,
  telephone: SITE.phoneE164,
  priceRange: "$0–$249/mo",
  description: "Practical AI for local businesses: AI receptionist, website chat that books appointments, review requests and Google listing audits.",
  address: { "@type": "PostalAddress", addressLocality: "Santa Teresa", addressRegion: "NM", postalCode: "88008", addressCountry: "US" },
  areaServed: SITE.areas.map((a) => ({ "@type": "Place", name: a })),
  founder: { "@type": "Person", name: "Bobby Lloyd" },
};

const CSS = `
:root{--bg:#0B0C0E;--panel:#14161A;--ink:#F5F3EF;--mute:#9E9AA3;--line:rgba(255,255,255,.1);--acc:#D96B43;--acc2:#E5A93C}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:300 17px/1.65 'Plus Jakarta Sans',system-ui,-apple-system,Segoe UI,sans-serif}
a{color:var(--acc2)}a:hover{color:var(--acc)}
.wrap{max-width:1040px;margin:0 auto;padding:0 20px}
header.top{border-bottom:1px solid var(--line)}header.top .wrap{display:flex;justify-content:space-between;align-items:center;padding-top:16px;padding-bottom:16px;gap:16px}
.brand{font:500 19px 'Cabinet Grotesk',system-ui,sans-serif;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:10px}
.brand svg{color:var(--acc)}
nav.top a{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);text-decoration:none;margin-left:22px}
nav.top a:hover{color:var(--acc2)}
.brand span{white-space:nowrap}nav.top{white-space:nowrap}
@media(max-width:640px){nav.top a{margin-left:14px;letter-spacing:.12em}nav.top a.hide-sm{display:none}.hero{padding-top:44px}}
.kicker,.eyebrow{font:500 11px 'JetBrains Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:var(--mute)}
.hero{padding:72px 0 40px}.hero .kicker{color:var(--acc2)}
h1{font:300 clamp(34px,5.6vw,58px)/1.05 'Cabinet Grotesk',system-ui,sans-serif;letter-spacing:-.02em;margin:14px 0 22px;max-width:860px}
h2{font:300 clamp(24px,3vw,32px)/1.2 'Cabinet Grotesk',system-ui,sans-serif;letter-spacing:-.01em;margin:0 0 14px}
.lede{color:#C9C5BF;max-width:720px;font-size:19px}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.btn{display:inline-flex;align-items:center;justify-content:center;font:500 11px 'JetBrains Mono',monospace;letter-spacing:.2em;text-transform:uppercase;padding:16px 22px;text-decoration:none;border:1px solid var(--line);color:var(--ink)}
.btn.primary{background:var(--acc);color:var(--bg);border-color:var(--acc)}.btn.primary:hover{background:var(--acc2);border-color:var(--acc2);color:var(--bg)}
.btn:hover{border-color:var(--acc2);color:var(--acc2)}
section.block{border-top:1px solid var(--line);padding:44px 0}
.grid{display:grid;grid-template-columns:1fr;gap:28px}@media(min-width:860px){.grid{grid-template-columns:5fr 7fr}}
ul.ticks{list-style:none;padding:0;margin:0}ul.ticks li{padding:9px 0 9px 28px;position:relative;border-bottom:1px solid var(--line)}
ul.ticks li:before{content:"";position:absolute;left:4px;top:18px;width:10px;height:5px;border-left:2px solid var(--acc2);border-bottom:2px solid var(--acc2);transform:rotate(-45deg)}
p{margin:0 0 14px}.mute{color:var(--mute)}
.demo{background:var(--panel);border:1px solid var(--line);padding:26px;margin-top:8px}
.demo .num{font:300 34px 'Cabinet Grotesk',system-ui,sans-serif;color:var(--ink);text-decoration:none}
.price{display:flex;flex-wrap:wrap;gap:14px}.price div{flex:1 1 200px;background:var(--panel);border:1px solid var(--line);padding:20px}
.price b{display:block;font:300 34px 'Cabinet Grotesk',system-ui,sans-serif}.price .hl{border-color:rgba(229,169,60,.6)}
details{border-bottom:1px solid var(--line);padding:16px 0}summary{cursor:pointer;font-weight:400;list-style:none}summary::-webkit-details-marker{display:none}
summary:after{content:"+";float:right;color:var(--mute)}details[open] summary:after{content:"–"}details p{color:var(--mute);margin-top:10px}
.related a{display:inline-block;margin:0 14px 10px 0}
footer{border-top:1px solid var(--line);padding:34px 0 50px;color:var(--mute);font-size:14px}
`;

const MOUNTAIN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;

function page(pg) {
  const url = `${SITE.url}/${pg.slug}/`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      ORG,
      { "@type": "WebPage", "@id": url, url, name: pg.title, description: pg.description, isPartOf: { "@id": `${SITE.url}/#website` }, about: { "@id": `${SITE.url}/#business` }, dateModified: today },
      { "@type": "Service", name: pg.h1, provider: { "@id": `${SITE.url}/#business` }, areaServed: pg.area, offers: [
        { "@type": "Offer", name: "Free Google listing audit", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Local Discovery Pro report", price: String(SITE.price.pro), priceCurrency: "USD" },
        { "@type": "Offer", name: "Local Growth Plan", price: String(SITE.price.plan), priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", price: String(SITE.price.plan), priceCurrency: "USD", unitCode: "MON" } },
      ] },
      { "@type": "FAQPage", mainEntity: pg.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE.url}/` },
        { "@type": "ListItem", position: 2, name: pg.h1, item: url },
      ] },
    ],
  };
  const sections = pg.sections.map((s) => `
    <section class="block"><div class="wrap grid">
      <div><h2>${esc(s.h)}</h2></div>
      <div>${s.p ? s.p.map((x) => `<p>${esc(x)}</p>`).join("") : ""}${s.list ? `<ul class="ticks">${s.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>
    </div></section>`).join("");
  const related = PAGES.filter((p) => p.slug !== pg.slug).map((p) => `<a href="/${p.slug}/">${esc(p.h1)}</a>`).join("");
  const cta = pg.cta || { label: "Run my free audit", href: "/#audit" };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pg.title)}</title>
<meta name="description" content="${esc(pg.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(pg.title)}">
<meta property="og:description" content="${esc(pg.description)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0B0C0E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@300,400,500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&family=Plus+Jakarta+Sans:wght@300;400&display=swap">
<style>${CSS.replace(/\n/g, "")}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/">${MOUNTAIN}<span>Mesa Intelligence</span></a>
  <nav class="top"><a href="/#audit">Free Audit</a><a href="/plan">Pricing</a><a class="hide-sm" href="/book">Book a Call</a></nav>
</div></header>
<main>
  <section class="hero"><div class="wrap">
    <div class="kicker">${esc(pg.kicker)}</div>
    <h1>${esc(pg.h1)}</h1>
    <p class="lede">${esc(pg.lede)}</p>
    <div class="ctas"><a class="btn primary" href="${cta.href}">${esc(cta.label)}</a><a class="btn" href="/plan">See pricing</a><a class="btn" href="tel:${SITE.demoE164}">Call the live demo</a></div>
  </div></section>
  ${sections}
  <section class="block"><div class="wrap grid">
    <div><h2>Hear it for yourself</h2><p class="mute">A live AI receptionist set up for a sample HVAC company. Ask a question, try to book a visit.</p></div>
    <div class="demo"><div class="eyebrow">Demo line</div><a class="num" href="tel:${SITE.demoE164}">${SITE.demo}</a><p class="mute" style="margin-top:8px">Available 24/7. Your version answers with your business name, hours and services.</p></div>
  </div></section>
  <section class="block"><div class="wrap">
    <h2>What it costs</h2>
    <div class="price">
      <div><span class="eyebrow">Listing audit</span><b>Free</b><span class="mute">Score, rank and top 3 problems in 15 seconds.</span></div>
      <div><span class="eyebrow">Pro report</span><b>$${SITE.price.pro}</b><span class="mute">Full report and 30-day plan. Credited toward the plan.</span></div>
      <div class="hl"><span class="eyebrow">Local Growth Plan</span><b>$${SITE.price.plan}<span class="mute" style="font-size:15px"> / month</span></b><span class="mute">or $${SITE.price.annual.toLocaleString("en-US")} a year. Month to month, cancel any time.</span></div>
    </div>
    <div class="ctas"><a class="btn primary" href="/plan">Start the plan</a><a class="btn" href="/book">Book a 15-minute call</a></div>
  </div></section>
  <section class="block"><div class="wrap grid">
    <div><h2>Questions</h2></div>
    <div>${pg.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
  </div></section>
  <section class="block"><div class="wrap">
    <div class="eyebrow" style="margin-bottom:14px">More from Mesa Intelligence</div>
    <div class="related">${related}<a href="/plan">Pricing</a></div>
  </div></section>
</main>
<footer><div class="wrap">
  <strong style="color:var(--ink);font-weight:400">${SITE.legal}</strong> · Santa Teresa, NM · Serving Las Cruces, El Paso &amp; Southern New Mexico<br>
  <a href="mailto:${SITE.email}">${SITE.email}</a> · <a href="tel:${SITE.phoneE164}">${SITE.phone}</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
</div></footer>
</body>
</html>
`;
}

// ---------- write pages ----------
for (const pg of PAGES) {
  const dir = join(PUBLIC, pg.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page(pg));
}

// ---------- sitemap + robots ----------
const urls = [
  { loc: `${SITE.url}/`, pr: "1.0" },
  { loc: `${SITE.url}/plan`, pr: "0.9" },
  ...PAGES.map((p) => ({ loc: `${SITE.url}/${p.slug}/`, pr: "0.8" })),
  { loc: `${SITE.url}/book`, pr: "0.5" },
  { loc: `${SITE.url}/privacy`, pr: "0.2" },
  { loc: `${SITE.url}/terms`, pr: "0.2" },
];
writeFileSync(join(PUBLIC, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pr}</priority></url>`).join("\n")}
</urlset>
`);
writeFileSync(join(PUBLIC, "robots.txt"), `User-agent: *
Allow: /
Disallow: /admin
Disallow: /portal
Disallow: /audit/
Disallow: /api/
Disallow: /embed

Sitemap: ${SITE.url}/sitemap.xml
`);
console.log(`wrote ${PAGES.length} pages, sitemap.xml (${urls.length} urls), robots.txt`);
