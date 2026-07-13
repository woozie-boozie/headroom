"use client";

import { useMemo, useState } from "react";
import { analyzeCapacity, getFacility } from "@/lib/facility";
import { fmtMw, fmtPct } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { LoadChart } from "@/components/LoadChart";
import { PowerStack } from "@/components/PowerStack";
import { TenantTable } from "@/components/TenantTable";
import { GridPanel } from "@/components/GridPanel";
import { Copilot } from "@/components/Copilot";
import { Orchestration } from "@/components/Orchestration";

export default function Home() {
  const facility = useMemo(() => getFacility(), []);
  const [riskPct, setRiskPct] = useState(50);
  const analysis = useMemo(() => analyzeCapacity(facility, riskPct / 100), [facility, riskPct]);

  const breachTone =
    analysis.breachProbabilityPct < 2
      ? "text-emerald-400"
      : analysis.breachProbabilityPct < 8
        ? "text-amber-400"
        : "text-rose-400";

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-20">
      {/* nav */}
      <header className="flex items-center justify-between border-b border-border py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-emerald-400">◢ Headroom</span>
          <span className="text-xs text-muted">Energy OS · prototype</span>
        </div>
        <a
          href="#about"
          className="rounded-full border border-border bg-panel px-3 py-1 text-xs text-slate-300 hover:border-emerald-500/40"
        >
          Built for Zendo →
        </a>
      </header>

      {/* hero */}
      <section className="pt-10">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">
          Reclaiming stranded data-center capacity
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-slate-100 sm:text-4xl">
          {facility.config.name} is selling{" "}
          <span className="tabular text-slate-300">{fmtMw(analysis.contractedFacilityMw)}</span> of a
          10 MW connection — but only draws{" "}
          <span className="tabular text-sky-300">{fmtMw(analysis.coincidentPeakMw)}</span> at peak.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          Operators provision for every tenant&apos;s contracted nameplate. Real coincident demand is
          far lower. That gap — minus an N+1 reserve and a risk buffer — is{" "}
          <span className="font-medium text-emerald-400">sellable capacity</span> you can let to new
          AI tenants{" "}
          <span className="text-slate-200">without waiting years for a new grid connection.</span>
        </p>
      </section>

      {/* headline stats */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Grid connection" value={fmtMw(analysis.installedMw, 0)} sub="installed / contracted cap" />
        <StatTile
          label="Sold to tenants"
          value={fmtMw(analysis.contractedFacilityMw)}
          sub={`${facility.tenants.length} tenants · ${facility.tenants.reduce((s, t) => s + t.racks, 0)} racks`}
          accent="amber"
        />
        <StatTile
          label="Real coincident peak"
          value={fmtMw(analysis.coincidentPeakMw)}
          sub={`${fmtPct(analysis.utilisationPct)} utilised · ${analysis.diversityFactor.toFixed(2)} diversity`}
          accent="sky"
        />
        <StatTile
          label="Reclaimable now"
          value={fmtMw(analysis.reclaimableMw)}
          sub={`≈ ${analysis.reclaimableAiRacks} more AI racks`}
          accent="emerald"
          emphasis
        />
      </section>

      {/* risk slider */}
      <section className="mt-4 rounded-xl border border-border bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-slate-200">Oversubscription risk appetite</h2>
            <p className="text-xs text-muted">
              How much of the headroom you&apos;re willing to sell before real load could exceed the
              plan.
            </p>
          </div>
          <div className="tabular text-right text-xs text-muted">
            plan ceiling <span className="text-slate-200">{fmtMw(analysis.planningCeilingMw)}</span> ·
            breach risk <span className={breachTone}>{fmtPct(analysis.breachProbabilityPct, 1)}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <span className="w-24 text-right text-xs text-emerald-400">Conservative</span>
          <input
            type="range"
            min={0}
            max={100}
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="flex-1"
            aria-label="Oversubscription risk appetite"
          />
          <span className="w-24 text-xs text-rose-400">Aggressive</span>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-2 border-t border-border pt-3">
          <span className="tabular text-2xl font-semibold text-emerald-400">
            {fmtMw(analysis.reclaimableMw)}
          </span>
          <span className="text-sm text-slate-400">
            reclaimable ≈ <span className="text-slate-200">{analysis.reclaimableAiRacks} AI racks</span>{" "}
            · <span className={breachTone}>{fmtPct(analysis.breachProbabilityPct, 1)}</span> chance
            real load exceeds the plan
          </span>
        </div>
      </section>

      {/* load chart */}
      <section className="mt-4 rounded-xl border border-border bg-panel p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-200">Facility load · past 7 days</h2>
          <div className="flex gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-sky-400" />load
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-0.5 w-3 bg-rose-400" />grid cap
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-0.5 w-3 bg-amber-400" />usable
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-0.5 w-3 bg-emerald-400" />plan ceiling
            </span>
          </div>
        </div>
        <LoadChart facility={facility} analysis={analysis} />
      </section>

      {/* live grid */}
      <section className="mt-4">
        <GridPanel />
      </section>

      {/* energy copilot */}
      <section className="mt-4">
        <Copilot />
      </section>

      {/* orchestration */}
      <section className="mt-4">
        <Orchestration />
      </section>

      {/* power stack + tenants */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-panel p-5">
          <h2 className="mb-4 text-sm font-medium text-slate-200">Power path · where the watts go</h2>
          <PowerStack facility={facility} analysis={analysis} />
        </div>
        <div className="rounded-xl border border-border bg-panel p-5">
          <h2 className="mb-3 text-sm font-medium text-slate-200">
            Tenants · contracted vs actual draw
          </h2>
          <TenantTable facility={facility} />
        </div>
      </section>

      {/* about / concept */}
      <section id="about" className="mt-12 border-t border-border pt-8">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">Built to apply to Zendo</p>
        <h2 className="mt-3 max-w-3xl text-xl font-semibold text-slate-100">
          A working slice of an Energy OS — not a pitch deck.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Rather than send a CV, I built the thing: the stranded-capacity problem Zendo solves,
          wired to the live UK grid, with an operator copilot that recommends what it can and defers
          anything that would breach the N+1 reserve to a human. Facility telemetry is simulated; the
          grid feed — NESO carbon intensity + 48-hour forecast and Octopus Agile pricing — is live,
          no API keys.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">What&apos;s here</div>
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              <li>· Reclaim stranded capacity with a risk-tuned oversubscription model</li>
              <li>· Live grid intelligence → greenest / cheapest windows for flexible load</li>
              <li>· An operator copilot that reasons over live headroom + grid and defers risky calls</li>
              <li>· A typed operator↔tenant capacity-request API with an OpenAPI spec</li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">What I&apos;d build in month one</div>
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              <li>· Swap simulated telemetry for real BMS / PDU feeds behind the same interfaces</li>
              <li>· Per-tenant, SLA-aware oversubscription policy instead of one global dial</li>
              <li>· Make copilot proposals executable through an approvals flow — every irreversible action gated</li>
              <li>· Grow the capacity API into a real market: priorities, queuing, settlement</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <a href="https://keedastudios.com" className="text-emerald-400 hover:underline">
            keedastudios.com →
          </a>
        </div>
      </section>
    </main>
  );
}
