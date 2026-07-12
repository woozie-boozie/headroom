// Live UK grid intelligence, fetched server-side (no auth on any of these).
//   - Carbon intensity + 48h forecast + generation mix: NESO Carbon Intensity API
//   - Dynamic import price: Octopus Agile (London region C) — thematically apt,
//     Zendo's co-founder is ex-Octopus.
// Every fetch degrades gracefully; `live` flags whether real data came back.

const CI = "https://api.carbonintensity.org.uk";
const AGILE_TARIFF = "E-1R-AGILE-24-10-01-C"; // London
const AGILE_URL = `https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/${AGILE_TARIFF}/standard-unit-rates/?page_size=100`;

const RENEWABLE = new Set(["wind", "solar", "hydro", "biomass"]);
const LOW_CARBON = new Set(["wind", "solar", "hydro", "biomass", "nuclear"]);

export interface ForecastPoint {
  from: string; // ISO
  carbon: number; // gCO2/kWh (forecast)
  index: string;
  pricePPerKwh?: number; // Octopus Agile, where published
}

export interface GridConditions {
  updatedAt: string;
  live: boolean;
  current: {
    carbon: number;
    index: string;
    pricePPerKwh: number | null;
    renewablePct: number;
    lowCarbonPct: number;
    windPct: number;
  };
  mix: { fuel: string; perc: number }[];
  forecast: ForecastPoint[];
  greenestWindow: { from: string; carbon: number } | null;
  cheapestWindow: { from: string; pricePPerKwh: number } | null;
}

async function getJson<T>(url: string, revalidate = 900): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function sumPerc(mix: { fuel: string; perc: number }[], set: Set<string>): number {
  return mix.filter((m) => set.has(m.fuel)).reduce((a, m) => a + m.perc, 0);
}

// NESO uses "2026-07-12T22:30Z"; Octopus uses "2026-07-12T22:30:00Z". Canonicalise
// both to minute precision so the two series align on the same half-hour key.
const halfHourKey = (iso: string) => iso.slice(0, 16) + "Z";

export async function getGridConditions(): Promise<GridConditions> {
  const nowIso = new Date().toISOString().slice(0, 16) + "Z";

  const [intensityNow, generation, fw, agile] = await Promise.all([
    getJson<{ data: { intensity: { actual: number | null; forecast: number; index: string } }[] }>(
      `${CI}/intensity`,
    ),
    getJson<{ data: { generationmix: { fuel: string; perc: number }[] } }>(`${CI}/generation`),
    getJson<{ data: { from: string; intensity: { forecast: number; index: string } }[] }>(
      `${CI}/intensity/${nowIso}/fw48h`,
    ),
    getJson<{ results: { valid_from: string; value_inc_vat: number }[] }>(AGILE_URL),
  ]);

  const live = Boolean(intensityNow && fw);

  const mix = generation?.data.generationmix ?? [];
  const renewablePct = sumPerc(mix, RENEWABLE);
  const lowCarbonPct = sumPerc(mix, LOW_CARBON);
  const windPct = mix.find((m) => m.fuel === "wind")?.perc ?? 0;

  // Price map keyed by half-hour start.
  const priceByHalfHour = new Map<string, number>();
  for (const r of agile?.results ?? []) priceByHalfHour.set(halfHourKey(r.valid_from), r.value_inc_vat);

  const forecast: ForecastPoint[] = (fw?.data ?? []).slice(0, 96).map((p) => ({
    from: p.from,
    carbon: p.intensity.forecast,
    index: p.intensity.index,
    pricePPerKwh: priceByHalfHour.get(halfHourKey(p.from)),
  }));

  // Current price = the Agile window covering now (fall back to the latest known).
  const currentPrice =
    forecast.find((p) => p.pricePPerKwh != null)?.pricePPerKwh ??
    (agile?.results?.[0]?.value_inc_vat ?? null);

  // Next 24h windows.
  const next24 = forecast.slice(0, 48);
  const greenest = next24.reduce<ForecastPoint | null>(
    (best, p) => (!best || p.carbon < best.carbon ? p : best),
    null,
  );
  const priced = forecast.filter((p) => p.pricePPerKwh != null);
  const cheapest = priced.reduce<ForecastPoint | null>(
    (best, p) => (!best || (p.pricePPerKwh ?? 0) < (best.pricePPerKwh ?? Infinity) ? p : best),
    null,
  );

  const nowIntensity =
    intensityNow?.data[0]?.intensity.actual ?? intensityNow?.data[0]?.intensity.forecast ?? 0;

  return {
    updatedAt: new Date().toISOString(),
    live,
    current: {
      carbon: nowIntensity,
      index: intensityNow?.data[0]?.intensity.index ?? "unknown",
      pricePPerKwh: currentPrice,
      renewablePct,
      lowCarbonPct,
      windPct,
    },
    mix: [...mix].sort((a, b) => b.perc - a.perc),
    forecast,
    greenestWindow: greenest ? { from: greenest.from, carbon: greenest.carbon } : null,
    cheapestWindow:
      cheapest && cheapest.pricePPerKwh != null
        ? { from: cheapest.from, pricePPerKwh: cheapest.pricePPerKwh }
        : null,
  };
}
