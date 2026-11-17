// GET /p/:slug/go — "Start my free trial" on a preview: alert Bobby, then the plan page tagged with the preview.
import { loadPreview, recordClaim, isHuman } from "../../_lib/preview.js";

export async function onRequestGet({ request, env, params, waitUntil }) {
  const slug = String(params.slug || "").toLowerCase();
  const row = await loadPreview(env, slug).catch(() => null);
  const base = (env.SITE_URL || "https://mesaintelligence.ai").replace(/\/$/, "");
  const to = `${base}/plan?utm_source=preview&utm_medium=text&utm_campaign=website-preview&utm_content=${encodeURIComponent(slug)}`;
  if (row && isHuman(request) && new URL(request.url).searchParams.get("admin") !== "1") {
    const p = recordClaim(env, row).catch((e) => console.error("preview claim", e?.message || e));
    if (typeof waitUntil === "function") waitUntil(p); else await p;
  }
  return Response.redirect(to, 302);
}
