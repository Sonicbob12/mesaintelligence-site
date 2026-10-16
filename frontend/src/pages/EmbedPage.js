import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AgentChat from "@/components/AgentChat";
import { fetchTenant } from "@/lib/agentClient";

// /embed?tenant=<id> — the chat alone, framed by public/widget.js on a client's site.
export default function EmbedPage() {
  const [params] = useSearchParams();
  const id = params.get("tenant");
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) { setError("Missing tenant"); return; }
    fetchTenant(id).then(setTenant).catch(() => setError("This assistant isn't available right now."));
  }, [id]);

  useEffect(() => {
    // Let the host page's loader know we're ready (used to swap the launcher icon).
    if (tenant) window.parent?.postMessage({ type: "mesa:ready", tenant: tenant.id }, "*");
  }, [tenant]);

  return (
    <div className="h-screen w-screen bg-[#14161A] text-[#F5F3EF] flex flex-col">
      {error && <div className="m-auto text-sm text-[#9E9AA3] font-light px-6 text-center">{error}</div>}
      {!error && !tenant && <div className="m-auto font-mono text-[11px] uppercase tracking-[0.2em] text-[#9E9AA3]">Loading…</div>}
      {tenant && (
        <>
          <div className="flex-1 min-h-0 flex flex-col">
            <AgentChat tenant={tenant} compact />
          </div>
          <div className="px-4 py-1.5 border-t border-white/8 text-[10px] font-mono tracking-wide text-[#9E9AA3]/70 text-right">
            Powered by <a href="https://mesaintelligence.ai" target="_blank" rel="noreferrer" className="hover:text-[#E5A93C]">Mesa Intelligence</a>
          </div>
        </>
      )}
    </div>
  );
}
