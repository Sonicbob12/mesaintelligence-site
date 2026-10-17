import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// /admin → Workflows: integration status, per-business settings, test chain, recent runs.
const input = "w-full bg-transparent border border-white/12 px-4 py-3 text-sm font-light placeholder:text-[#9E9AA3]/50 focus:outline-none focus:border-[#D96B43] transition-colors";
const btn = "font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3 border border-white/20 hover:border-[#E5A93C] hover:text-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const primary = "font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-3 bg-[#D96B43] text-[#0B0C0E] hover:bg-[#E5A93C] transition-colors disabled:opacity-40 flex items-center gap-2";
const fmt = (s) => (s ? new Date(s * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-");
const mark = { done: "✓", failed: "✗", skipped: "–", running: "…", pending: "·" };
const color = { done: "#8EA89D", failed: "#D96B43", skipped: "#E5A93C", running: "#9E9AA3", pending: "#9E9AA3" };

export default function AdminWorkflows({ call, tenantId }) {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [test, setTest] = useState({ phone: "", email: "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    if (!tenantId) return;
    call(`/admin/workflows?tenant=${encodeURIComponent(tenantId)}`).then((d) => { setData(d); setSettings(d.settings || {}); }).catch((e) => setMsg(e.message));
  }, [call, tenantId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy("save"); setMsg("");
    try { await call("/admin/workflows", { method: "PUT", body: JSON.stringify({ tenant: tenantId, workflows: settings }) }); setMsg("Workflow settings saved."); load(); }
    catch (e) { setMsg(e.message); }
    setBusy("");
  };
  const runTest = async () => {
    setBusy("test"); setMsg("");
    try { const r = await call("/admin/workflows", { method: "POST", body: JSON.stringify({ tenant: tenantId, test: true, phone: test.phone || undefined, email: test.email || undefined }) }); setOpen(r.run); load(); }
    catch (e) { setMsg(e.message); }
    setBusy("");
  };

  const I = data?.integrations;
  return (
    <section className="border border-white/10 bg-[#14161A] p-6 space-y-5" data-testid="admin-workflows">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Workflows</div>
      {I && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Pill ok={I.twilio} label="Twilio texting" /><Pill ok={I.google} label={`Google Calendar + Sheets${I.service_account ? ` (${I.service_account})` : ""}`} /><Pill ok={I.email} label="Email" /><Pill ok={I.cron} label="Hourly cron (reminders + digest)" />
        </div>
      )}
      {msg && <div className="text-sm text-[#E5A93C]">{msg}</div>}

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <label className="space-y-1"><span className="text-[#9E9AA3]">Google Calendar ID (share it with the service account)</span><input value={settings.calendar_id || ""} onChange={(e) => setSettings({ ...settings, calendar_id: e.target.value })} placeholder="abc123@group.calendar.google.com" className={input} data-testid="wf-calendar" /></label>
        <label className="space-y-1"><span className="text-[#9E9AA3]">Google Sheet ID (share it with the service account)</span><input value={settings.sheet_id || ""} onChange={(e) => setSettings({ ...settings, sheet_id: e.target.value })} placeholder="1AbC…xyz" className={input} data-testid="wf-sheet" /></label>
        <label className="space-y-1"><span className="text-[#9E9AA3]">Sheet tab</span><input value={settings.sheet_tab || ""} onChange={(e) => setSettings({ ...settings, sheet_tab: e.target.value })} placeholder="Sheet1" className={input} /></label>
        <label className="space-y-1"><span className="text-[#9E9AA3]">Daily digest hour (local, 0–23)</span><input value={settings.digest_hour ?? 18} onChange={(e) => setSettings({ ...settings, digest_hour: e.target.value })} className={input} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.sms !== false} onChange={(e) => setSettings({ ...settings, sms: e.target.checked })} /> Text customers confirmations</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reminders !== false} onChange={(e) => setSettings({ ...settings, reminders: e.target.checked })} /> Day-before reminder texts</label>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={save} disabled={busy === "save"} className={btn} data-testid="wf-save">{busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save settings</button>
        <span className="text-[#9E9AA3] text-sm">·</span>
        <input value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} placeholder="Your mobile (optional)" className={`${input} max-w-[200px]`} data-testid="wf-test-phone" />
        <button onClick={runTest} disabled={busy === "test"} className={primary} data-testid="wf-test">{busy === "test" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Run test chain</button>
        <span className="text-xs text-[#9E9AA3]">Fires a real chain for a fake booking two days out.</span>
      </div>

      {open && <RunDetail run={open} onClose={() => setOpen(null)} />}

      <div className="border-t border-white/8 pt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3] mb-2">Recent runs ({data?.runs?.length || 0})</div>
        {!data?.runs?.length && <div className="text-sm text-[#9E9AA3]">none yet</div>}
        {data?.runs?.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-[#9E9AA3] font-mono text-[10px] uppercase tracking-[0.15em]"><th className="font-normal pb-2 pr-4">When</th><th className="font-normal pr-4">Trigger</th><th className="font-normal pr-4">Steps</th><th className="font-normal">Status</th></tr></thead>
            <tbody>{data.runs.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} className="border-t border-white/8 cursor-pointer hover:bg-white/[0.03]">
                <td className="py-2 pr-4 whitespace-nowrap">{fmt(r.created_at)}</td><td className="py-2 pr-4">{r.trigger}</td>
                <td className="py-2 pr-4 font-mono">{r.steps.map((s) => <span key={s.key} title={`${s.label}: ${s.detail}`} style={{ color: color[s.status] }} className="mr-1">{mark[s.status] || "?"}</span>)}</td>
                <td className="py-2">{r.status}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}

function RunDetail({ run, onClose }) {
  return (
    <div className="border border-white/10 p-4 text-sm space-y-2" data-testid="wf-run-detail">
      <div className="flex items-center gap-3"><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Run · {run.trigger} · {run.status}</span><button className="ml-auto text-xs text-[#9E9AA3] hover:text-[#E5A93C]" onClick={onClose}>close</button></div>
      {run.steps.map((s) => (
        <div key={s.key} className="flex gap-3"><span style={{ color: color[s.status] }} className="w-4">{mark[s.status] || "?"}</span><span className="w-64 shrink-0">{s.label}</span><span className="text-[#9E9AA3] break-all">{s.detail}{s.ms != null ? ` · ${(s.ms / 1000).toFixed(1)}s` : ""}</span></div>
      ))}
    </div>
  );
}

function Pill({ ok, label }) {
  return <span className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-[#8EA89D]" : "bg-[#9E9AA3]/40"}`} />{label}</span>;
}
