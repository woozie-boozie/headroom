import type { CapacityAnalysis, FacilitySnapshot } from "@/lib/facility";

// Illustrative view of the power path from the grid down to the racks. Each
// layer is derated from the one above (redundancy + conversion losses); the gap
// between the real peak draw and each layer's rating is where headroom hides.
export function PowerStack({
  facility,
  analysis,
}: {
  facility: FacilitySnapshot;
  analysis: CapacityAnalysis;
}) {
  const peak = analysis.coincidentPeakMw;
  const peakIt = peak / facility.config.pue;

  const layers = [
    { name: "Grid connection", rated: 10.0, used: peak, note: "11kV utility feed — the hard cap" },
    { name: "Transformer", rated: 9.8, used: peak, note: "HV → LV, ~2% loss" },
    { name: "UPS · 2N", rated: 8.5, used: peak, note: "one full string held in reserve" },
    { name: "PDU / busway", rated: 8.5, used: peak, note: "distribution to rows" },
    { name: "IT racks", rated: 8.5 / facility.config.pue, used: peakIt, note: "the paying compute" },
  ];

  return (
    <div className="space-y-2.5">
      {layers.map((l) => {
        const pct = Math.min(100, (l.used / l.rated) * 100);
        return (
          <div key={l.name} className="flex items-center gap-3">
            <div className="w-28 shrink-0 text-right text-xs text-slate-300">{l.name}</div>
            <div className="relative h-7 flex-1 overflow-hidden rounded-md border border-border bg-panel-2">
              <div
                className="absolute inset-y-0 left-0 bg-sky-500/30"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex h-full items-center justify-between px-2 text-[11px]">
                <span className="tabular text-sky-200">{l.used.toFixed(2)} MW</span>
                <span className="tabular text-muted">of {l.rated.toFixed(2)}</span>
              </div>
            </div>
            <div className="hidden w-40 shrink-0 text-[11px] text-muted sm:block">{l.note}</div>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted">
        Peak IT load reaches only{" "}
        <span className="tabular text-slate-200">{peakIt.toFixed(2)} MW</span> against a 10 MW grid
        connection — the empty space above each bar is capacity you&apos;ve already paid for.
      </p>
    </div>
  );
}
