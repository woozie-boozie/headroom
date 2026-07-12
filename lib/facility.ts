// Deterministic model of a single data-center facility.
//
// The numbers here are simulated (a real operator's rack-level telemetry is not
// public), but the *shape* is real: operators sell capacity against tenants'
// contracted nameplate peak, while the actual coincident draw is far lower. The
// gap — minus a redundancy reserve and a risk buffer — is sellable "stranded"
// capacity that can be let to new AI tenants without a new grid connection.
//
// Everything is seeded so the demo renders identically on server, client, and
// every deploy (no hydration drift).

export type RackClass = "ai-training" | "ai-inference" | "enterprise" | "legacy";

export interface Tenant {
  id: string;
  name: string;
  rackClass: RackClass;
  racks: number;
  contractedKwPerRack: number; // nameplate the tenant pays for, per rack
  contractedItKw: number; // racks * contractedKwPerRack
}

export interface FacilityConfig {
  name: string;
  location: string;
  gridConnectionMw: number; // installed / contracted grid connection (hard cap)
  pue: number; // facility power / IT power
  redundancy: string; // e.g. "N+1"
  redundancyReserveMw: number; // capacity reserved to survive one unit failure
}

export interface FacilitySnapshot {
  config: FacilityConfig;
  tenants: Tenant[];
  /** Half-hourly timestamps (epoch ms), one week ending at the anchor. */
  timestamps: number[];
  /** Facility power draw (IT x PUE) in MW, per timestamp. */
  facilityLoadMw: number[];
  /** Latest actual IT draw per tenant, kW (for the tenant table). */
  currentItKw: Record<string, number>;
}

export interface CapacityAnalysis {
  installedMw: number;
  contractedFacilityMw: number; // what's been sold, PUE-adjusted
  coincidentPeakMw: number; // real observed facility peak
  meanLoadMw: number;
  usableMw: number; // installed - redundancy reserve
  diversityFactor: number; // coincidentPeak / contracted
  utilisationPct: number; // coincidentPeak / installed
  // Risk-adjusted planning:
  riskTolerance: number; // 0..1
  planningCeilingMw: number; // statistical peak we plan capacity to
  reclaimableMw: number; // usable - planning ceiling
  reclaimableAiRacks: number; // reclaimable expressed in ~70kW AI racks
  breachProbabilityPct: number; // chance real load exceeds the planning ceiling
}

const ANCHOR = 1_759_276_800_000; // fixed Mon 2025-09-01 00:00 UTC — keeps the sim deterministic
const HALF_HOUR = 30 * 60 * 1000;
const WEEK_POINTS = 7 * 48; // one week, half-hourly
const AVG_AI_RACK_KW = 70; // to express reclaimable MW as "N more AI racks"

// --- deterministic PRNG (mulberry32) ---------------------------------------
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tenants roughly modelled on a colo mixing AI training/inference with legacy
// enterprise load. Contracted IT sums to ~6.8 MW → ~9.2 MW facility at PUE 1.35.
const TENANT_SEED: Omit<Tenant, "contractedItKw">[] = [
  { id: "helios", name: "Helios AI — training cluster", rackClass: "ai-training", racks: 12, contractedKwPerRack: 90 },
  { id: "nimbus", name: "Nimbus Inference", rackClass: "ai-inference", racks: 20, contractedKwPerRack: 35 },
  { id: "orbit", name: "Orbit Compute — training", rackClass: "ai-training", racks: 8, contractedKwPerRack: 110 },
  { id: "meridian", name: "Meridian Bank", rackClass: "enterprise", racks: 40, contractedKwPerRack: 8 },
  { id: "fenix", name: "Fenix Labs — inference", rackClass: "ai-inference", racks: 24, contractedKwPerRack: 30 },
  { id: "cobalt", name: "Cobalt Cloud — training", rackClass: "ai-training", racks: 10, contractedKwPerRack: 85 },
  { id: "vantage", name: "Vantage SaaS", rackClass: "enterprise", racks: 60, contractedKwPerRack: 7 },
  { id: "colo", name: "Mixed colocation", rackClass: "legacy", racks: 90, contractedKwPerRack: 6 },
  { id: "stratus", name: "Stratus GenAI — training", rackClass: "ai-training", racks: 9, contractedKwPerRack: 100 },
  { id: "pulse", name: "Pulse Analytics", rackClass: "enterprise", racks: 55, contractedKwPerRack: 7 },
];

// Per-class load factor (fraction of contracted IT actually drawn) at a given
// half-hour of the week. Training runs hot and bursty; inference and enterprise
// are diurnal; legacy is flat. Diversity between them is what creates headroom.
function loadFactor(cls: RackClass, hourOfDay: number, isWeekend: boolean, r: () => number): number {
  const noise = () => (r() - 0.5) * 2; // [-1, 1]
  switch (cls) {
    case "ai-training": {
      // Runs hot, but with checkpoint/job gaps that de-synchronise the fleet.
      const burst = r() < 0.06 ? 0.22 : 0; // rare push toward saturation
      const gap = r() < 0.15 ? -0.25 : 0; // job gaps between runs
      return clamp(0.62 + burst + gap + noise() * 0.05, 0.32, 0.98);
    }
    case "ai-inference": {
      // Diurnal — tracks user demand, higher daytime.
      const diurnal = 0.46 + 0.26 * Math.sin(((hourOfDay - 8) / 24) * 2 * Math.PI);
      const weekend = isWeekend ? -0.08 : 0;
      return clamp(diurnal + weekend + noise() * 0.05, 0.2, 0.85);
    }
    case "enterprise": {
      // Business hours; quiet nights and weekends.
      const business = hourOfDay >= 8 && hourOfDay <= 19 ? 0.6 : 0.2;
      const weekend = isWeekend ? -0.25 : 0;
      return clamp(business + weekend + noise() * 0.04, 0.12, 0.72);
    }
    case "legacy":
    default:
      return clamp(0.42 + noise() * 0.05, 0.32, 0.52);
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

let cached: FacilitySnapshot | null = null;

export function getFacility(): FacilitySnapshot {
  if (cached) return cached;

  const config: FacilityConfig = {
    name: "Redhill DC-1",
    location: "Greater London, UK",
    gridConnectionMw: 10,
    pue: 1.35,
    redundancy: "N+1",
    redundancyReserveMw: 1.5,
  };

  const tenants: Tenant[] = TENANT_SEED.map((t) => ({
    ...t,
    contractedItKw: t.racks * t.contractedKwPerRack,
  }));

  const timestamps: number[] = [];
  const facilityLoadMw: number[] = [];
  const lastItKw: Record<string, number> = {};

  const r = rng(0x2e17d0);

  for (let i = 0; i < WEEK_POINTS; i++) {
    const ts = ANCHOR + i * HALF_HOUR;
    const hourOfDay = ((i % 48) / 2 + 0.0) % 24;
    const dayOfWeek = Math.floor(i / 48); // 0 = Monday
    const isWeekend = dayOfWeek >= 5;

    let itKw = 0;
    for (const t of tenants) {
      const lf = loadFactor(t.rackClass, hourOfDay, isWeekend, r);
      const draw = t.contractedItKw * lf;
      itKw += draw;
      if (i === WEEK_POINTS - 1) lastItKw[t.id] = draw;
    }
    timestamps.push(ts);
    facilityLoadMw.push((itKw * config.pue) / 1000);
  }

  cached = { config, tenants, timestamps, facilityLoadMw, currentItKw: lastItKw };
  return cached;
}

// --- statistics -------------------------------------------------------------
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stddev(xs: number[], m: number): number {
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}
// Standard normal CDF via erf approximation (Abramowitz & Stegun 7.1.26).
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-(z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * Analyse how much capacity can be safely reclaimed and re-sold.
 *
 * riskTolerance 0 = conservative (plan for a 3-sigma peak, ~0.1% breach chance),
 * 1 = aggressive (plan for a ~0.8-sigma peak, ~20% breach chance). Higher risk
 * unlocks more reclaimable MW but raises the chance real load exceeds the plan.
 */
export function analyzeCapacity(f: FacilitySnapshot, riskTolerance: number): CapacityAnalysis {
  const rt = clamp(riskTolerance, 0, 1);
  const installedMw = f.config.gridConnectionMw;
  const usableMw = installedMw - f.config.redundancyReserveMw;

  const contractedItKw = f.tenants.reduce((a, t) => a + t.contractedItKw, 0);
  const contractedFacilityMw = (contractedItKw * f.config.pue) / 1000;

  const coincidentPeakMw = Math.max(...f.facilityLoadMw);
  const m = mean(f.facilityLoadMw);
  const sd = stddev(f.facilityLoadMw, m);

  const z = 3 - rt * 2.2; // risk 0 → z=3.0, risk 1 → z=0.8
  const planningCeilingMw = Math.min(usableMw, m + z * sd);
  const reclaimableMw = Math.max(0, usableMw - planningCeilingMw);

  return {
    installedMw,
    contractedFacilityMw,
    coincidentPeakMw,
    meanLoadMw: m,
    usableMw,
    diversityFactor: coincidentPeakMw / contractedFacilityMw,
    utilisationPct: (coincidentPeakMw / installedMw) * 100,
    riskTolerance: rt,
    planningCeilingMw,
    reclaimableMw,
    reclaimableAiRacks: Math.floor((reclaimableMw * 1000) / AVG_AI_RACK_KW),
    breachProbabilityPct: (1 - normalCdf(z)) * 100,
  };
}

export const RACK_CLASS_LABEL: Record<RackClass, string> = {
  "ai-training": "AI training",
  "ai-inference": "AI inference",
  enterprise: "Enterprise",
  legacy: "Legacy colo",
};
