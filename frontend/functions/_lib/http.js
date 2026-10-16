export function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
}

export function sseHeaders() {
  return { "content-type": "text/event-stream", "cache-control": "no-cache, no-store", "x-accel-buffering": "no" };
}

export const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
}

// Admin endpoints: `Authorization: Bearer <ADMIN_TOKEN>`
export function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return json({ detail: "ADMIN_TOKEN not set" }, 503);
  const h = request.headers.get("authorization") || "";
  const tok = h.replace(/^Bearer\s+/i, "").trim();
  if (!tok || !timingSafeEqual(tok, env.ADMIN_TOKEN)) return json({ detail: "Unauthorized" }, 401);
  return null;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function readJSON(request) {
  try { return await request.json(); } catch { return null; }
}
