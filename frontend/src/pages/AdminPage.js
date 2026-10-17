import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, LogOut } from "lucide-react";

// /admin — minimal operator console. Paste the ADMIN_TOKEN (kept in this tab only).
const API = "/api";
const input = "w-full bg-transparent border border-white/12 px-4 py-3 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors";
const btn = "font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3 border border-white/20 hover:border-[#E5A93C] hover:text-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const fmt = (s) => (s ? new Date(s * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-");

export default function AdminPage() {
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem("mesa_admin") || ""; } catch { return ""; } });
  const [draft, setDraft] = useState("");
  const [health, setHealth] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [activity, setActivity] = useState(null);
  const [voice, setVoice] = useState(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [transcript, setTranscript] = useState(null);

  const call = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API}${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { setToken(""); try { sessionStorage.removeItem("mesa_admin"); } catch {} throw new Error("Token rejected"); }
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setMsg("");
    try {
      const [h, t] = await Promise.all([fetch(`${API}/health`).then((r) => r.json()), call("/admin/tenants")]);
      setHealth(h); setTenants(t);
      setTenantId((cur) => cur || t[0]?.id || "");
      if (h.retell) call("/admin/voice").then(setVoice).catch((e) => setVoice({ error: e.message }));
    } catch (e) { setMsg(e.message); }
  }, [token, call]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!token || !tenantId) return;
    setTranscript(null);
    call(`/admin/activity?tenant=${encodeURIComponent(tenantId)}&limit=30`).then(setActivity).catch((e) => setMsg(e.message));
  }, [token, tenantId, call]);

  const saveToken = (e) => { e.preventDefault(); const t = draft.trim(); if (!t) return; try { sessionStorage.setItem("mesa_admin", t); } catch {} setToken(t); setDraft(""); };
  const signOut = () => { try { sessionStorage.removeItem("mesa_admin"); } catch {} setToken(""); setHealth(null); setActivity(null); setVoice(null); };

  const setupVoice = async (withNumber) => {
    setBusy("voice"); setMsg("");
    try {
      const body = { tenant: tenantId, ...(withNumber && phone ? { phone_number: phone.trim() } : {}) };
      const r = await call("/admin/voice", { method: "POST", body: JSON.stringify(body) });
      setMsg(`Voice agent ready for ${r.tenant} (agent ${r.agent_id}${r.phone_number ? `, number ${r.phone_number}` : ""}).`);
      await load();
    } catch (e) { setMsg(`Voice setup failed: ${e.message}`); }
    setBusy("");
  };

  const openTranscript = async (id) => {
    try { setTranscript(await call(`/admin/activity?conversation=${encodeURIComponent(id)}`)); } catch (e) { setMsg(e.message); }
  };

  const current = tenants.find((t) => t.id === tenantId);

  if (!token) {
    return (
      <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] flex items-center justify-center px-6">
        <form onSubmit={saveToken} className="w-full max-w-sm border border-white/10 bg-[#14161A] p-8 space-y-4">
          <div className="font-display text-xl font-medium">Mesa Intelligence — Admin</div>
          <p className="text-[#9E9AA3] text-sm font-light">Paste the admin token from Cloudflare (ADMIN_TOKEN). It stays in this browser tab only.</p>
          <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Admin token" className={input} autoFocus data-testid="admin-token-input" />
          <button type="submit" className={primary} data-testid="admin-token-submit">Open console</button>
          {msg && <p className="text-[#D96B43] text-sm">{msg}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] px-6 sm:px-12 py-10 font-light">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-wrap items-center gap-4">
          <div className="font-display text-2xl font-medium">Mesa Intelligence — Admin</div>
          <div className="ml-auto flex gap-2">
            <button onClick={load} className={btn}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
            <button onClick={signOut} className={btn}><LogOut className="w-3.5 h-3.5" /> Sign out</button>
          </div>
        </header>

        {msg && <div className="border border-[#E5A93C]/40 bg-[#E5A93C]/5 px-4 py-3 text-sm">{msg}</div>}

        {health && (
          <section className="border border-white/10 bg-[#14161A] p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-3">System</div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Pill ok={health.anthropic} label={`Claude ${health.model}`} />
              <Pill ok={health.db?.startsWith("ok")} label={`Database: ${health.db}`} />
              <Pill ok={health.resend} label={`Email → ${health.lead_to || "not set"}`} />
              <Pill ok={health.retell} label="Retell (voice)" />
              <Pill ok={health.twilio} label="Twilio (SMS)" />
            </div>
          </section>
        )}

        <section className="border border-white/10 bg-[#14161A] p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Business</div>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={`${input} max-w-xs appearance-none`} data-testid="admin-tenant-select">
              {tenants.map((t) => <option key={t.id} value={t.id} className="bg-[#14161A]">{t.name}{t.demo ? " (demo)" : ""}</option>)}
            </select>
            {current && (
              <div className="text-sm text-[#9E9AA3]">
                {current.voice_number ? `Voice line ${current.voice_number}` : current.retell_agent_id ? "Voice agent ready (no number)" : "No voice agent yet"}
                {current.sms_number ? ` · SMS ${current.sms_number}` : ""}
                {current.notify_email ? ` · notifies ${current.notify_email}` : " · notifications off"}
              </div>
            )}
          </div>

          <div className="border-t border-white/8 pt-4 space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Voice (Retell)</div>
            {!health?.retell && <p className="text-sm text-[#9E9AA3]">Add RETELL_API_KEY in Cloudflare → Variables and Secrets, then redeploy.</p>}
            {health?.retell && (
              <>
                <div className="flex flex-wrap gap-3 items-center">
                  <button disabled={busy === "voice"} onClick={() => setupVoice(false)} className={btn} data-testid="admin-voice-setup">
                    {busy === "voice" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} {current?.retell_agent_id ? "Update voice agent" : "Create voice agent"}
                  </button>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15755550123" className={`${input} max-w-[200px]`} data-testid="admin-voice-number" />
                  <button disabled={busy === "voice" || !phone.trim()} onClick={() => setupVoice(true)} className={primary} data-testid="admin-voice-assign">Assign number</button>
                </div>
                <p className="text-xs text-[#9E9AA3]">"Create/Update" builds the agent from this business's persona, hours, services and knowledge. "Assign number" also points a Retell number at it and sets the inbound webhook. Re-run Update after changing knowledge.</p>
                {voice?.numbers && (
                  <div className="text-sm">
                    <div className="text-[#9E9AA3] mb-1">Your Retell numbers:</div>
                    {voice.numbers.length === 0 && <div className="text-[#9E9AA3]">none yet — buy one in the Retell dashboard</div>}
                    {voice.numbers.map((n) => (
                      <div key={n.number} className="flex gap-3 flex-wrap">
                        <span className="font-mono">{n.number}</span>
                        <span className="text-[#9E9AA3]">{n.tenant ? `→ ${n.tenant}` : n.agent ? "assigned outside Mesa" : "unassigned"}</span>
                        {!n.tenant && <button className="text-[#E5A93C] text-xs" onClick={() => setPhone(n.number)}>use</button>}
                      </div>
                    ))}
                  </div>
                )}
                {voice?.error && <p className="text-xs text-[#D96B43]">{voice.error}</p>}
              </>
            )}
          </div>
        </section>

        {activity && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Table title="Bookings" rows={activity.bookings} cols={[["customer_name", "Customer"], ["service", "Service"], ["start_at", "When", fmt], ["phone", "Phone"]]} />
            <Table title="Leads" rows={activity.leads} cols={[["name", "Name"], ["phone", "Phone"], ["summary", "Summary"], ["source", "Via"]]} />
            <Table title="Hand-offs" rows={activity.handoffs} cols={[["urgency", "Urgency"], ["reason", "Reason"], ["callback_phone", "Callback"], ["created_at", "At", fmt]]} />
            <Table title="Conversations" rows={activity.conversations} cols={[["channel", "Channel"], ["turns", "Turns"], ["summary", "Summary"], ["updated_at", "Updated", fmt]]} onRow={(r) => openTranscript(r.id)} />
          </section>
        )}

        {transcript && (
          <section className="border border-white/10 bg-[#14161A] p-6">
            <div className="flex items-center gap-4 mb-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Transcript · {transcript.channel} · {transcript.id}</div>
              <button className="ml-auto text-xs text-[#9E9AA3] hover:text-[#E5A93C]" onClick={() => setTranscript(null)}>close</button>
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-light">{transcript.transcript || "(empty)"}</pre>
          </section>
        )}
      </div>
    </main>
  );
}

function Pill({ ok, label }) {
  return <span className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[#8EA89D]" : "bg-[#9E9AA3]/40"}`} />{label}</span>;
}

function Table({ title, rows, cols, onRow }) {
  return (
    <div className="border border-white/10 bg-[#14161A] p-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-3">{title} <span className="text-[#9E9AA3]/60">({rows?.length || 0})</span></div>
      {!rows?.length && <div className="text-sm text-[#9E9AA3]">none yet</div>}
      {rows?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]">{cols.map(([k, h]) => <th key={k} className="pb-2 pr-4 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={onRow ? () => onRow(r) : undefined} className={`border-t border-white/8 align-top ${onRow ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}>
                  {cols.map(([k, , f]) => <td key={k} className="py-2 pr-4 max-w-[260px] truncate">{f ? f(r[k]) : (r[k] ?? "-")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
