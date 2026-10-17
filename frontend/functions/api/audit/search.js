// POST /api/audit/search { query } → up to 5 Google listings to pick from.
import { searchCandidates } from "../../_lib/places.js";
import { hit } from "../../_lib/db.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

export async function onRequestPost({ request, env }) {
  if (!env.GOOGLE_PLACES_API_KEY) return json({ detail: "The audit tool isn't switched on yet." }, 503);
  const b = await readJSON(request);
  const query = String(b?.query || "").trim().slice(0, 120);
  if (query.length < 3) return json({ detail: "Type your business name and city." }, 400);
  const ip = clientIp(request);
  const perIp = await hit(env, `audit-search:${ip}`, 3600, Number(env.AUDIT_SEARCH_LIMIT_PER_HOUR || 15));
  if (!perIp.allowed) return json({ detail: "That's a lot of searches — try again in an hour." }, 429);
  const day = await hit(env, "audit-search:daily", 86400, Number(env.AUDIT_SEARCH_DAILY_CAP || 300));
  if (!day.allowed) return json({ detail: "The audit tool is resting for today. Book a call and we'll run it for you." }, 429);
  try {
    return json({ candidates: await searchCandidates(env, query) });
  } catch (e) {
    return json({ detail: e.status === 503 ? "The audit tool isn't switched on yet." : "Search failed — please try again." }, e.status === 400 ? 400 : 502);
  }
}
