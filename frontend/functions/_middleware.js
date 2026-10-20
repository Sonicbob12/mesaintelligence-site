// Per-route <title>/description/canonical for the single-page app, and noindex for private pages.
// The React routes all share public/index.html, so without this every URL would carry the homepage title.
// Static landing pages (public/<slug>/index.html) and /api are passed through untouched.

const META = {
  "/plan": {
    title: "Pricing — Free Audit, $99 Pro Report, $249/mo Local Growth Plan | Mesa Intelligence",
    description: "Mesa Intelligence pricing: free Google listing audit, $99 Pro report credited toward the plan, and the Local Growth Plan at $249/month — AI receptionist, website chat, review requests and monthly audits. Cancel any time.",
  },
  "/book": {
    title: "Book a 15-Minute Call with Bobby | Mesa Intelligence",
    description: "Book a free 15-minute call with Mesa Intelligence to go through your Google listing, website and where you rank — and what's worth fixing first.",
  },
  "/privacy": { title: "Privacy Policy | Mesa Intelligence", description: "Privacy policy for Mesa Intelligence LLC, including SMS program terms." },
  "/terms": { title: "Terms & Conditions | Mesa Intelligence", description: "Terms and conditions for Mesa Intelligence LLC services and SMS program." },
  "/sms": { title: "SMS Program | Mesa Intelligence", description: "How Mesa Intelligence uses text messages: appointment confirmations and reminders. Reply STOP to opt out." },
};
const PRIVATE = [/^\/admin/, /^\/portal/, /^\/audit\//, /^\/embed/];

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/api/") || request.method !== "GET") return next();

  const res = await next();
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html")) return res;

  const isPrivate = PRIVATE.some((re) => re.test(path));
  const meta = META[path];
  if (!isPrivate && !meta) return res; // homepage + static landing pages already carry their own tags

  const out = new HTMLRewriter();
  if (meta) {
    const canonical = `https://mesaintelligence.ai${path}`;
    out.on("title", { element(e) { e.setInnerContent(meta.title); } })
      .on('meta[name="description"]', { element(e) { e.setAttribute("content", meta.description); } })
      .on('link[rel="canonical"]', { element(e) { e.setAttribute("href", canonical); } })
      .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", meta.title); } })
      .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", meta.description); } })
      .on('meta[property="og:url"]', { element(e) { e.setAttribute("content", canonical); } });
  }
  if (isPrivate) {
    out.on("head", { element(e) { e.append('<meta name="robots" content="noindex,nofollow">', { html: true }); } });
  }
  const rewritten = out.transform(res);
  if (isPrivate) {
    const h = new Headers(rewritten.headers);
    h.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(rewritten.body, { status: rewritten.status, headers: h });
  }
  return rewritten;
}
