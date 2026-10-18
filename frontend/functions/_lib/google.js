// Google Calendar + Sheets via a service account (no OAuth screens for clients: they just share
// a calendar / spreadsheet with the service account's email).
// Env: GOOGLE_SA_EMAIL, GOOGLE_SA_KEY (the private_key from the JSON key file, "\n" escapes OK).
// GOOGLE_BASE_URL / GOOGLE_TOKEN_URL override hosts for local tests.

const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/spreadsheets";
let cached = { token: null, exp: 0, key: null };
let inflight = null; // concurrent steps share one token request

export const googleConfigured = (env) => Boolean(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_KEY);

function pemToDer(pem) {
  const b64 = pem.replace(/\\n/g, "\n").replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

export async function accessToken(env) {
  if (!googleConfigured(env)) throw new Error("Google service account not configured");
  if (cached.token && cached.key === env.GOOGLE_SA_EMAIL && Date.now() < cached.exp - 60_000) return cached.token;
  if (!inflight) inflight = fetchToken(env).finally(() => { inflight = null; });
  return inflight;
}

async function fetchToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: env.GOOGLE_SA_EMAIL, scope: SCOPES, aud: env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(env.GOOGLE_SA_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${b64url(sig)}`;
  const res = await fetch(env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google token: ${res.status} ${data.error_description || data.error || ""}`.trim());
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000, key: env.GOOGLE_SA_EMAIL };
  return data.access_token;
}

// Calendar and Sheets live on different hosts. GOOGLE_BASE_URL (tests) overrides both.
const hostFor = (env, path) => env.GOOGLE_BASE_URL || (path.startsWith("/v4/spreadsheets") ? "https://sheets.googleapis.com" : "https://www.googleapis.com");

async function gapi(env, method, path, body) {
  const token = await accessToken(env);
  const res = await fetch(`${hostFor(env, path)}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) throw new Error(`Google ${res.status}: ${(data.error?.message || text).slice(0, 200)}`);
  return data;
}

// Calendar: create an event. Returns { id, link }.
export async function createCalendarEvent(env, calendarId, { summary, description, startMs, endMs, timeZone, location }) {
  const ev = await gapi(env, "POST", `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    summary, description, location,
    start: { dateTime: new Date(startMs).toISOString(), timeZone },
    end: { dateTime: new Date(endMs).toISOString(), timeZone },
    reminders: { useDefault: true },
  });
  return { id: ev.id, link: ev.htmlLink || null };
}

// Sheets: append one row to the first sheet (or a named tab). Returns the updated range.
export async function appendSheetRow(env, spreadsheetId, row, tab = "Sheet1") {
  const range = encodeURIComponent(`${tab}!A1`);
  const data = await gapi(env, "POST", `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: [row] });
  return { range: data.updates?.updatedRange || null };
}
