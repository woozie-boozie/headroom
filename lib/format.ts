export const fmtMw = (x: number, dp = 2) => `${x.toFixed(dp)} MW`;
export const fmtKw = (x: number) => `${Math.round(x).toLocaleString()} kW`;
export const fmtPct = (x: number, dp = 0) => `${x.toFixed(dp)}%`;
export const fmtGbp = (x: number) =>
  x.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
export const fmtGbpPerMwh = (x: number) => `£${x.toFixed(0)}/MWh`;
export const fmtCo2 = (x: number) => `${Math.round(x)} gCO₂/kWh`;

/** "Tue 09:00" from an ISO timestamp (local time). */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Label a facility timestamp by weekday (the sim is anchored to a Monday). */
export function dayLabel(ts: number, anchor: number): string {
  const idx = Math.floor((ts - anchor) / (24 * 60 * 60 * 1000));
  return DAYS[idx % 7] ?? "";
}
