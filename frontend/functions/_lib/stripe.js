// Minimal Stripe client for Cloudflare Pages Functions (no SDK; plain REST + Web Crypto).
// Secrets: STRIPE_SECRET_KEY (sk_live_… / sk_test_…), STRIPE_WEBHOOK_SECRET (whsec_…), STRIPE_PRICE_ID (price_…).

const API = "https://api.stripe.com/v1";

function form(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => out.push(...(typeof x === "object" ? [form(x, `${key}[${i}]`)] : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(x)}`])));
    else if (typeof v === "object") out.push(form(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}

export async function stripe(env, method, path, body, idempotencyKey) {
  if (!env.STRIPE_SECRET_KEY) { const e = new Error("STRIPE_SECRET_KEY is not set"); e.status = 503; throw e; }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
    body: body ? form(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`Stripe ${method} ${path} → ${res.status}`, JSON.stringify(data).slice(0, 300)); const e = new Error(data?.error?.message || `Stripe ${res.status}`); e.status = res.status; throw e; }
  return data;
}

// Checkout Session for the Pro audit. metadata.audit_id ties the payment back to the audit.
export async function createProCheckout(env, { auditId, email, businessName, successUrl, cancelUrl }) {
  return stripe(env, "POST", "/checkout/sessions", {
    mode: "payment",
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: email || undefined,
    client_reference_id: auditId,
    metadata: { audit_id: auditId, business: String(businessName || "").slice(0, 200) },
    payment_intent_data: { description: `Local Discovery Pro audit — ${String(businessName || "").slice(0, 80)}` },
    allow_promotion_codes: true,
    automatic_tax: env.STRIPE_AUTOMATIC_TAX === "1" ? { enabled: true } : undefined,
  }, `pro-${auditId}-${Date.now()}`);
}

// Verify a webhook payload (Stripe-Signature: t=…,v1=…). Returns the parsed event or throws.
export async function verifyWebhook(env, rawBody, sigHeader, toleranceSec = 300) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  const parts = Object.fromEntries(String(sigHeader || "").split(",").map((p) => p.split("=").map((s) => s.trim())));
  const t = parts.t, v1s = String(sigHeader || "").split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  if (!t || !v1s.length) throw new Error("bad signature header");
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) throw new Error("timestamp outside tolerance");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const ok = v1s.some((v) => v.length === expected.length && timingSafe(v, expected));
  if (!ok) throw new Error("signature mismatch");
  return JSON.parse(rawBody);
}

function timingSafe(a, b) { let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
