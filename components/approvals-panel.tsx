"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, ShieldCheck, X } from "lucide-react";

type Approval = {
  id: string;
  action_type: string;
  summary: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "failed" | "executed" | string;
  created_at: string;
  decided_at?: string | null;
  execution_result?: { url?: string | null; message?: string } | null;
};

export default function ApprovalsPanel() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/approvals");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Approvals could not be loaded.");
      setApprovals(data.approvals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approvals could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/approvals");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Approvals could not be loaded.");
        if (active) setApprovals(data.approvals ?? []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Approvals could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The decision could not be saved.");
      setApprovals((current) => current.map((item) => item.id === id ? { ...item, ...data.approval, execution_result: data.result ?? item.execution_result } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The decision could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = approvals.filter((item) => item.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-300/10 text-violet-200"><ShieldCheck size={19}/></div>
          <div><h2 className="text-sm font-medium text-slate-200">Action approvals</h2><p className="mt-1 text-xs text-slate-500">Review the exact proposal before any connected tool can act.</p></div>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-slate-400">{pendingCount} pending</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-200">{error}</p>}
      {loading ? <p className="py-10 text-center text-xs text-slate-500">Loading approvals...</p> : approvals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
          <Clock3 className="mx-auto text-slate-600" size={24}/>
          <p className="mt-4 text-sm text-slate-300">No action proposals yet</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">When the assistant prepares an external action, its proposal will appear here for review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <article key={approval.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-200">{approval.action_type}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] ${approval.status === "pending" ? "bg-amber-300/10 text-amber-200" : approval.status === "approved" ? "bg-emerald-300/10 text-emerald-200" : "bg-white/[0.06] text-slate-400"}`}>{approval.status}</span>
              </div>
              <h3 className="mt-3 text-sm font-medium text-slate-200">{approval.summary}</h3>
              <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-white/[0.06] bg-[#090d14] p-3 text-[10px] leading-5 text-slate-400">{JSON.stringify(approval.payload, null, 2)}</pre>
              {approval.status === "pending" ? (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button onClick={() => void decide(approval.id, "reject")} disabled={busyId === approval.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-50"><X size={14}/> Reject</button>
                  <button onClick={() => void decide(approval.id, "approve")} disabled={busyId === approval.id} className="flex items-center gap-2 rounded-lg bg-violet-300 px-3 py-2 text-xs font-semibold text-[#11111a] transition hover:bg-violet-200 disabled:opacity-50"><Check size={14}/>{busyId === approval.id ? "Saving..." : "Approve & execute"}</button>
                </div>
              ) : (
                <p className="mt-4 text-[10px] text-slate-600">{approval.status === "executed" ? "Executed successfully after approval." : approval.status === "rejected" ? "Proposal rejected." : approval.status === "failed" ? "Execution failed. Review the error and check GitHub before retrying." : "Approval recorded; check the connected GitHub repository for the result."}{approval.execution_result?.url && <a href={approval.execution_result.url} target="_blank" rel="noreferrer" className="ml-2 text-violet-200 underline">Open result</a>}</p>
              )}
            </article>
          ))}
        </div>
      )}
      <button onClick={() => void refresh()} disabled={loading} className="text-xs text-violet-200 hover:text-violet-100 disabled:opacity-50">Refresh approvals</button>
    </div>
  );
}
