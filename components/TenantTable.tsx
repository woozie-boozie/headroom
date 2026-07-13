import { FacilitySnapshot, RACK_CLASS_LABEL, RackClass } from "@/lib/facility";

const CLASS_STYLE: Record<RackClass, string> = {
  "ai-training": "bg-emerald-500/15 text-emerald-700",
  "ai-inference": "bg-sky-500/15 text-sky-700",
  enterprise: "bg-violet-500/15 text-violet-700",
  legacy: "bg-slate-500/15 text-slate-700",
};

export function TenantTable({ facility }: { facility: FacilitySnapshot }) {
  const rows = [...facility.tenants].sort((a, b) => b.contractedItKw - a.contractedItKw);
  const totalContracted = rows.reduce((s, t) => s + t.contractedItKw, 0);
  const totalNow = rows.reduce((s, t) => s + (facility.currentItKw[t.id] ?? 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="pb-2 font-medium">Tenant</th>
            <th className="pb-2 font-medium">Class</th>
            <th className="pb-2 pl-6 text-right font-medium">Racks</th>
            <th className="pb-2 pl-6 text-right font-medium">Contracted</th>
            <th className="pb-2 pl-6 text-right font-medium">Now</th>
            <th className="pb-2 pl-6 font-medium">Utilisation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const now = facility.currentItKw[t.id] ?? 0;
            const util = (now / t.contractedItKw) * 100;
            return (
              <tr key={t.id} className="border-b border-border/50">
                <td className="py-2 pr-2 text-slate-800">{t.name}</td>
                <td className="py-2 pr-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${CLASS_STYLE[t.rackClass]}`}>
                    {RACK_CLASS_LABEL[t.rackClass]}
                  </span>
                </td>
                <td className="tabular py-2 pl-6 text-right text-slate-700">{t.racks}</td>
                <td className="tabular py-2 pl-6 text-right text-slate-700">
                  {t.contractedItKw.toLocaleString()} kW
                </td>
                <td className="tabular py-2 pl-6 text-right text-slate-600">
                  {Math.round(now).toLocaleString()} kW
                </td>
                <td className="py-2 pl-6">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-panel-2">
                      <div
                        className="h-full rounded-full bg-sky-400/70"
                        style={{ width: `${Math.min(100, util)}%` }}
                      />
                    </div>
                    <span className="tabular w-9 text-right text-xs text-muted">
                      {util.toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="text-[13px] font-medium text-slate-800">
            <td className="pt-2" colSpan={3}>
              {rows.length} tenants ·{" "}
              {rows.reduce((s, t) => s + t.racks, 0)} racks
            </td>
            <td className="tabular whitespace-nowrap pt-2 pl-6 text-right">
              {totalContracted.toLocaleString()} kW
            </td>
            <td className="tabular whitespace-nowrap pt-2 pl-6 text-right">
              {Math.round(totalNow).toLocaleString()} kW
            </td>
            <td className="tabular pt-2 pl-6 text-xs text-muted">
              {((totalNow / totalContracted) * 100).toFixed(0)}% of contracted
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
