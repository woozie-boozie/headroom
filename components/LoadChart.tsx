"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CapacityAnalysis, FacilitySnapshot } from "@/lib/facility";
import { dayLabel } from "@/lib/format";

export function LoadChart({
  facility,
  analysis,
}: {
  facility: FacilitySnapshot;
  analysis: CapacityAnalysis;
}) {
  const anchor = facility.timestamps[0];
  const data = facility.facilityLoadMw.map((mw, i) => ({ i, mw }));
  const dayTicks = data.filter((d) => d.i % 48 === 0).map((d) => d.i);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="load" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#16202f" vertical={false} />
          <XAxis
            dataKey="i"
            ticks={dayTicks}
            tickFormatter={(i: number) => dayLabel(facility.timestamps[i], anchor)}
            stroke="#7d8ba0"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#1e2a3c" }}
          />
          <YAxis
            domain={[0, 10]}
            ticks={[0, 2, 4, 6, 8, 10]}
            stroke="#7d8ba0"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={34}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#0d1420",
              border: "1px solid #1e2a3c",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(i) => dayLabel(facility.timestamps[i as number], anchor)}
            formatter={(v) => [`${Number(v).toFixed(2)} MW`, "Facility load"]}
          />
          <Area type="monotone" dataKey="mw" stroke="#38bdf8" strokeWidth={2} fill="url(#load)" isAnimationActive={false} />
          <ReferenceLine
            y={analysis.installedMw}
            stroke="#f87171"
            strokeDasharray="5 4"
            label={{ value: "Grid cap 10 MW", position: "insideTopRight", fill: "#f87171", fontSize: 10 }}
          />
          <ReferenceLine
            y={analysis.usableMw}
            stroke="#fbbf24"
            strokeDasharray="5 4"
            label={{ value: `Usable after N+1 ${analysis.usableMw} MW`, position: "insideTopRight", fill: "#fbbf24", fontSize: 10 }}
          />
          <ReferenceLine
            y={analysis.planningCeilingMw}
            stroke="#34d399"
            strokeDasharray="2 5"
            label={{ value: `Plan ceiling ${analysis.planningCeilingMw.toFixed(1)} MW`, position: "insideBottomRight", fill: "#34d399", fontSize: 10 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
