"use client";

import { useEffect, useState } from "react";
import type { CapacityRequest, Headroom } from "@/lib/orchestration";

const VERDICT_STYLE: Record<string, string> = {
  granted: "bg-emerald-500/15 text-emerald-300",
  partial: "bg-amber-500/15 text-amber-300",
  denied: "bg-rose-500/15 text-rose-300",
};

const QUICK = [
  { tenant: "Helios AI", mw: 1.2, hours: 6 },
  { tenant: "Orbit Compute", mw: 0.8, hours: 12 },
  { tenant: "Stratus GenAI", mw: 2.0, hours: 8 },
];

export function Orchestration() {
  const [headroom, setHeadroom] = useState<Headroom | null>(null);
  const [requests, setRequests] = useState<CapacityRequest[]>([]);
  const [tenant, setTenant] = useState("Nova AI");
  const [mw, setMw] = useState("1.0");
  const [hours, setHours] = useState("6");
  const [priority, setPriority] = useState<"standard" | "high">("standard");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/capacity-requests");
    const data = await res.json();
    setHeadroom(data.headroom);
    setRequests(data.requests);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function submit(t: string, m: number, h: number, p: "standard" | "high" = "standard") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/capacity-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: t, mw: m, hours: h, priority: p }),
      });
      const data = await res.json();
      if (data.headroom) setHeadroom(data.headroom);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    await fetch("/api/capacity-requests", { method: "DELETE" });
    await refresh();
  }

  const totalReclaimable = headroom ? headroom.usableMw - headroom.baselineLoadMw : 0;
  const committedPct = totalReclaimable > 0 && headroom ? (headroom.committedMw / totalReclaimable) * 100 : 0;
  const availablePct = totalReclaimable > 0 && headroom ? (headroom.availableMw / totalReclaimable) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">Operator ↔ tenant orchestration</h2>
        <a
          href="/api/openapi"
          target="_blank"
          rel="noreferrer"
          className="rounded border border-border bg-panel-2 px-2 py-0.5 text-[11px] text-slate-300 hover:border-emerald-500/40"
        >
          API spec ↗
        </a>
      </div>

      {/* headroom bar */}
      {headroom && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Reclaimable headroom allocation</span>
            <span className="tabular">
              <span className="text-emerald-400">{headroom.availableMw.toFixed(2)} MW</span> available ·{" "}
              <span className="text-amber-400">{headroom.committedMw.toFixed(2)} MW</span> committed
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-panel-2">
            <div className="bg-amber-400/70" style={{ width: `${committedPct}%` }} />
            <div className="bg-emerald-400/70" style={{ width: `${availablePct}%` }} />
          </div>
        </div>
      )}

      {/* request form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(tenant, Number(mw), Number(hours), priority);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="text-xs text-muted">
          Tenant
          <input
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            className="mt-1 block w-32 rounded border border-border bg-panel-2 px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
          />
        </label>
        <label className="text-xs text-muted">
          MW
          <input
            type="number"
            step="0.1"
            min="0"
            value={mw}
            onChange={(e) => setMw(e.target.value)}
            className="tabular mt-1 block w-20 rounded border border-border bg-panel-2 px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
          />
        </label>
        <label className="text-xs text-muted">
          Hours
          <input
            type="number"
            step="1"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="tabular mt-1 block w-20 rounded border border-border bg-panel-2 px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
          />
        </label>
        <label className="text-xs text-muted">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as "standard" | "high")}
            className="mt-1 block rounded border border-border bg-panel-2 px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
          >
            <option value="standard">standard</option>
            <option value="high">high</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          Request
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-muted">quick:</span>
        {QUICK.map((q) => (
          <button
            key={q.tenant}
            onClick={() => submit(q.tenant, q.mw, q.hours)}
            className="rounded-full border border-border bg-panel-2 px-2 py-0.5 text-slate-300 hover:border-emerald-500/40"
          >
            {q.tenant} +{q.mw} MW
          </button>
        ))}
        {requests.length > 0 && (
          <button onClick={reset} className="ml-auto text-muted hover:text-slate-300">
            reset
          </button>
        )}
      </div>

      {/* ledger */}
      {requests.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {requests.map((r) => (
            <div key={r.id} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] uppercase ${VERDICT_STYLE[r.verdict]}`}>
                {r.verdict}
              </span>
              <div className="min-w-0">
                <span className="text-slate-200">{r.tenant}</span>{" "}
                <span className="tabular text-muted">
                  {r.requestedMw} MW / {r.hours}h
                  {r.verdict === "partial" && ` → ${r.grantedMw} MW`}
                </span>
                <div className="text-[11px] text-muted">{r.reason}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
