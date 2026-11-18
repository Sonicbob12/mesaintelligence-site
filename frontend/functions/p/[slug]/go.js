// /p/:slug/go — the payment link Bobby texts once an owner says they want to keep their website (Text 4).
// GET: a short signup page with the price ($PLAN_PRICE_USD/mo, no contract, no setup fee). Alerts Bobby.
// POST (email): Stripe Checkout for the monthly plan, with no trial and no setup fee, tagged to this preview.
import { loadPreview, recordClaim, renderStart, isHuman } from "../../_lib/preview.js";
import { createPlanCheckout, planConfigured } from "../../_lib/plan.js";
import { hit } from "../../_lib/db.js";
import { clientIp } from "../../_lib/http.js";

const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
const find = (env, params) => loadPreview(env, String(params.slug || "").toLowerCase()).catch(() => null);
const missing = () => html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;max-width:520px;margin:15vh auto;padding:0 20px"><h2>This link isn't available.</h2><p>Text Bobby and he'll send you a new one.</p></body>`, 404);

export async function onRequestGet({ request, env, params, waitUntil }) {
  const row = await find(env, params);
  if (!row || ["optout", "declined"].includes(row.status)) return missing();
  if (isHuman(request) && new URL(request.url).searchParams.get("admin") !== "1") {
    const p = recordClaim(env, row).catch((e) => console.error("preview claim", e?.message || e));
    if (typeof waitUntil === "function") waitUntil(p); else await p;
  }
  return html(renderStart(env, row));
}

export async function onRequestPost({ request, env, params }) {
  const row = await find(env, params);
  if (!row || ["optout", "declined"].includes(row.status)) return missing();
  const form = await request.formData().catch(() => null);
  const email = String(form?.get("email") || "").trim().slice(0, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return html(renderStart(env, row, { error: "Enter your email to continue." }), 400);
  if (!planConfigured(env)) return html(renderStart(env, row, { error: "Signup isn't open right now. Text Bobby and he'll set you up." }), 503);
  const lim = await hit(env, `plan-checkout:${clientIp(request)}`, 3600, 10).catch(() => ({ allowed: true }));
  if (!lim.allowed) return html(renderStart(env, row, { error: "Too many attempts. Try again in an hour." }), 429);
  try {
    const s = await createPlanCheckout(env, { email, interval: "month", outreachId: row.outreach_id || "", preview: { slug: row.slug, business: row.business, place_id: row.place_id },
      attribution: { utm_source: "preview", utm_medium: "text", utm_campaign: "website-preview", utm_content: row.slug } });
    return Response.redirect(s.url, 303);
  } catch (e) {
    console.error("preview checkout", e?.message || e);
    return html(renderStart(env, row, { error: "Couldn't start checkout. Text Bobby and he'll set you up by hand." }), 502);
  }
}
