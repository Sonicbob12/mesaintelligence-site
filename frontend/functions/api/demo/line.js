// /api/demo/line — the personalized demo line behind /hear?a=&k=&o= (see _lib/prospect_demo.js).
//   GET  ?a=<audit>&k=<share_key>        → { business, trade, city, voice } for the page header
//   POST { a, k, o }                     → { access_token, call_id, transport, ice_servers } (Retell v3 web call)

import { demoContext, startDemoCall } from "../../_lib/prospect_demo.js";
import { clientIp, json, readJSON } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  try {
    const ctx = await demoContext(env, { a: u.searchParams.get("a"), k: u.searchParams.get("k"), o: u.searchParams.get("o") });
    return json({ business: ctx.vars.business_name, trade: ctx.trade, city: ctx.vars.city, voice: Boolean(env.RETELL_API_KEY) });
  } catch (e) {
    return json({ detail: e.message || "Not found" }, e.status || 500);
  }
}

export async function onRequestPost({ request, env }) {
  const b = (await readJSON(request)) || {};
  try {
    const ctx = await demoContext(env, { a: b.a, k: b.k, o: b.o });
    const call = await startDemoCall(env, ctx, clientIp(request));
    return json({ access_token: call.access_token, call_id: call.call_id, transport: call.transport || null, ice_servers: call.ice_servers || null });
  } catch (e) {
    if (!e.status) console.error("demo line", e?.message || e);
    return json({ detail: e.status ? e.message : "Could not start the call right now." }, e.status || 502);
  }
}
