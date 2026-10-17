// Outbound SMS via Twilio. Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (E.164).
// A tenant with its own sms_number sends from that number instead. TWILIO_BASE_URL overrides for tests.

export const twilioConfigured = (env) => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);

export function toE164(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null; // US/Canada only for now
}

export async function sendSms(env, { to, body, from }) {
  if (!twilioConfigured(env)) throw new Error("Twilio not configured");
  const num = toE164(to);
  if (!num) throw new Error("Not a valid US phone number");
  const res = await fetch(`${env.TWILIO_BASE_URL || "https://api.twilio.com"}/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: num, From: from || env.TWILIO_FROM, Body: body.slice(0, 640) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(data.message || "").slice(0, 160)}`);
  return { sid: data.sid, to: num };
}
