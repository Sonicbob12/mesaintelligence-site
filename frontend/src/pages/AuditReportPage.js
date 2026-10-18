import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuditReport from "@/components/AuditReport";

// /audit/:id?k=<share_key> — the shareable, printable report page (basic or Pro).
// After a Stripe purchase the page lands here with &paid=1 and polls until the webhook unlocks Pro.

export default function AuditReportPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const k = sp.get("k") || "";
  const paid = sp.get("paid") === "1";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [waiting, setWaiting] = useState(paid);
  const tries = useRef(0);

  useEffect(() => {
    let timer;
    const load = async () => {
      try {
        const res = await fetch(`/api/audit/view?id=${encodeURIComponent(id)}&k=${encodeURIComponent(k)}`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.detail || "Report not found.");
        setData(d);
        if (paid && !d.pro && tries.current < 20) { tries.current += 1; timer = setTimeout(load, 3000); }
        else setWaiting(false);
      } catch (e) { setErr(e.message); setWaiting(false); }
    };
    load();
    return () => clearTimeout(timer);
  }, [id, k, paid]);

  const link = typeof window !== "undefined" ? `${window.location.origin}/audit/${id}?k=${k}` : "";

  return (
    <main className="min-h-screen bg-[#0B0C0E] text-[#F5F3EF] px-6 sm:px-12 lg:px-20 py-12 sm:py-16 print:bg-white print:text-black print:px-0 print:py-0">
      <style>{`@media print { body { background: #fff !important; } .print\\:text-black, .print\\:text-black * { color: #111 !important; } [data-testid="audit-report"] .bg-\\[\\#14161A\\] { background: #fff !important; } }`}</style>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 print:mb-4">
          <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3] hover:text-[#E5A93C]">← Mesa Intelligence</Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9E9AA3]">Local Discovery {data?.pro ? "Pro " : ""}Audit{data?.created_at ? ` · ${new Date(data.created_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</span>
        </div>

        {err && <p className="text-[#D96B43]">{err} <Link to="/#audit" className="text-[#E5A93C] underline ml-2">Run a new audit</Link></p>}
        {!err && !data && <div className="flex items-center gap-3 text-[#9E9AA3]"><Loader2 className="w-4 h-4 animate-spin text-[#D96B43]" /> Loading your report…</div>}

        {data && waiting && !data.pro && (
          <div className="border border-[#E5A93C]/50 bg-[#E5A93C]/[0.05] p-6 mb-6 flex items-center gap-3 text-sm print:hidden" data-testid="audit-paid-waiting">
            <Loader2 className="w-4 h-4 animate-spin text-[#E5A93C]" /> Thanks for your purchase — your Pro report is being built (about a minute). This page updates automatically, and a copy goes to your email.
          </div>
        )}
        {data && paid && !waiting && !data.pro && (
          <div className="border border-[#D96B43]/50 p-6 mb-6 text-sm print:hidden">Your payment went through but the Pro report is taking longer than usual. It will arrive by email; if not within 15 minutes, reply to any Mesa email or write <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a>.</div>
        )}

        {data && (
          <>
            {data.contact_name && <p className="text-sm text-[#9E9AA3] mb-6">Prepared for {data.contact_name}{data.business ? ` · ${data.business}` : ""}</p>}
            <AuditReport full={data.full} plan={data.plan} pro={data.pro} history={data.history} link={link} showPrint />
            {data.pro_mode === "paid" && !data.pro && (
              <div className="mt-8 border border-[#E5A93C]/50 bg-[#E5A93C]/[0.04] p-6 text-sm print:hidden">
                <b>Want the Pro report?</b> Two more search rankings, duplicate-listing check, the #1 competitor's website teardown, review themes, PageSpeed and a 30-day plan — ${data.pro_price}, one time. <Link to="/#audit" className="text-[#E5A93C] underline">Start from the audit section</Link> and choose “Unlock the Pro report”.
              </div>
            )}
            <p className="mt-10 text-sm text-[#9E9AA3] print:hidden">Questions or want help with the fixes? <a href="mailto:hello@mesaintelligence.ai" className="text-[#E5A93C]">hello@mesaintelligence.ai</a> · <Link to="/#contact" className="text-[#E5A93C]">Book a free walkthrough</Link></p>
            <p className="hidden print:block mt-8 text-xs">Mesa Intelligence LLC · Las Cruces, NM · mesaintelligence.ai · hello@mesaintelligence.ai</p>
          </>
        )}
      </div>
    </main>
  );
}
