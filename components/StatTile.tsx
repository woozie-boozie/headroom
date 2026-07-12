import { ReactNode } from "react";

type Accent = "emerald" | "sky" | "amber" | "rose" | "slate";

const ACCENT: Record<Accent, string> = {
  emerald: "text-emerald-400",
  sky: "text-sky-400",
  amber: "text-amber-400",
  rose: "text-rose-400",
  slate: "text-slate-200",
};

export function StatTile({
  label,
  value,
  sub,
  accent = "slate",
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: Accent;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-panel px-4 py-3 ${
        emphasis ? "ring-1 ring-emerald-500/30 bg-emerald-500/[0.03]" : ""
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-1 ${emphasis ? "text-3xl" : "text-2xl"} font-semibold ${ACCENT[accent]}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
