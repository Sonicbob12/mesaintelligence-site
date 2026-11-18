// GET /p/:slug — a website preview built for a business with no website (see _lib/preview.js).
// Hours, rating and phone are fetched live from Google Places (never stored). ?admin=1 skips the view alert.
import { loadPreview, renderPreview, recordView, isHuman, rateOk, isExpired } from "../_lib/preview.js";
import { placeDetails } from "../_lib/places.js";
import { clientIp } from "../_lib/http.js";

const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
const gone = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Preview not found</title><body style="font-family:sans-serif;max-width:520px;margin:15vh auto;padding:0 20px;color:#333"><h2>This preview isn't available.</h2><p>It may have been taken down. Questions? Text Bobby at <a href="sms:+15752541185">(575) 254-1185</a>.</p></body>`;

export async function onRequestGet({ request, env, params, waitUntil }) {
  const row = await loadPreview(env, String(params.slug || "").toLowerCase()).catch(() => null);
  if (!row || ["optout", "declined"].includes(row.status)) return html(gone, 404);
  // The preview really comes down after PREVIEW_DAYS (7). Bobby can still open it from /admin with ?admin=1.
  if (isExpired(env, row) && new URL(request.url).searchParams.get("admin") !== "1") return html(gone.replace("It may have been taken down.", "This preview has come down. Want it back?"), 410);
  const human = isHuman(request);
  const admin = new URL(request.url).searchParams.get("admin") === "1";
  // Live listing details cost a Places call; bots and over-limit IPs get the page from stored copy only.
  let live = null;
  if (human && (await rateOk(env, clientIp(request)).catch(() => true))) live = await placeDetails(env, row.place_id).catch(() => null);
  if (human && !admin) {
    const p = recordView(env, row).catch((e) => console.error("preview view", e?.message || e));
    if (typeof waitUntil === "function") waitUntil(p); else await p;
  }
  return html(renderPreview(env, row, live));
}
