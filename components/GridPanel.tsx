"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { GridConditions } from "@/lib/grid";
import { whenLabel } from "@/lib/format";

function indexColor(index: string): string {
  if (index.includes("very low") || index === "low") return "text-emerald-400";
  if (index === "moderate") return "text-amber-400";
  return "text-rose-400";
}

export function GridPanel() {
  const [g, setG] = useState<GridConditions | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/grid")
      .then((r) => r.json())
      .then(setG)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-panel p-5 text-sm text-muted">
        Live grid feed unavailable right now.
      </div>
    );
  }
  if (!g) {
    return (
      <div className="rounded-xl border border-border bg-panel p-5 text-sm text-muted">
        Connecting to the UK grid…
      </div>
    );
  }

  const c = g.current;
  const spark = g.forecast.map((p, i) => ({ i, carbon: p.carbon }));
  const greenDelta =
    g.greenestWindow && c.carbon ? Math.round((1 - g.greenestWindow.carbon / c.carbon) * 100) : 0;
  const cheapDelta =
    g.cheapestWindow && c.pricePPerKwh
      ? Math.round((1 - g.cheapestWindow.pricePPerKwh / c.pricePPerKwh) * 100)
      : 0;

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <h2 className="text-sm font-medium text-slate-200">Live UK grid intelligence</h2>
        </div>
        <span className="text-[11px] text-muted">
          {g.live ? "NESO · Octopus Agile" : "cached"} · GB
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-panel-2 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">Carbon intensity</div>
          <div className={`tabular text-2xl font-semibold ${indexColor(c.index)}`}>{c.carbon}</div>
          <div className="text-[11px] text-muted">gCO₂/kWh · {c.index}</div>
        </div>
        <div className="rounded-lg border border-border bg-panel-2 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">Renewables</div>
          <div className="tabular text-2xl font-semibold text-emerald-400">
            {c.renewablePct.toFixed(0)}%
          </div>
          <div className="text-[11px] text-muted">wind {c.windPct.toFixed(0)}% now</div>
        </div>
        <div className="rounded-lg border border-border bg-panel-2 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">Import price</div>
          <div className="tabular text-2xl font-semibold text-sky-400">
            {c.pricePPerKwh != null ? c.pricePPerKwh.toFixed(1) : "—"}
          </div>
          <div className="text-[11px] text-muted">p/kWh · Agile</div>
        </div>
      </div>

      {/* 48h carbon forecast sparkline */}
      <div className="mt-3 h-16 w-full">
        <ResponsiveContainer>
          <AreaChart data={spark} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="carbon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
            <Area
              type="monotone"
              dataKey="carbon"
              stroke="#34d399"
              strokeWidth={1.5}
              fill="url(#carbon)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mb-3 text-[11px] text-muted">48-hour carbon-intensity forecast (gCO₂/kWh)</div>

      {/* actionable windows */}
      <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
        {g.greenestWindow && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Greenest window (24h)</div>
            <div className="text-sm text-slate-200">
              {whenLabel(g.greenestWindow.from)} ·{" "}
              <span className="tabular text-emerald-400">{g.greenestWindow.carbon} gCO₂/kWh</span>{" "}
              {greenDelta > 0 && <span className="text-emerald-400">(−{greenDelta}%)</span>}
            </div>
          </div>
        )}
        {g.cheapestWindow && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Cheapest window</div>
            <div className="text-sm text-slate-200">
              {whenLabel(g.cheapestWindow.from)} ·{" "}
              <span className="tabular text-sky-400">
                {g.cheapestWindow.pricePPerKwh.toFixed(1)} p/kWh
              </span>{" "}
              {cheapDelta > 0 && <span className="text-sky-400">(−{cheapDelta}%)</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
