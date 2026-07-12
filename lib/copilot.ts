import Anthropic from "@anthropic-ai/sdk";
import { analyzeCapacity, FacilitySnapshot, getFacility } from "@/lib/facility";
import { getGridConditions } from "@/lib/grid";

// The Energy Copilot: an operator-facing agent that reasons over live facility
// headroom + live UK grid data to advise on capacity requests and scheduling.
// Its defining behaviour is a hard guardrail — it never "grants" an allocation
// that would breach the N+1 reserve or the risk-adjusted planning ceiling; those
// are deferred to the human operator. The model proposes; the human executes.

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 6;
const MAX_TOKENS = 1024;

// --- forecasting -----------------------------------------------------------
function dailyProfile(f: FacilitySnapshot) {
  const slots: number[][] = Array.from({ length: 48 }, () => []);
  f.facilityLoadMw.forEach((mw, i) => slots[i % 48].push(mw));
  return slots.map((arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
    return { mean, sd };
  });
}

function forecastLoad(f: FacilitySnapshot, hours: number) {
  const profile = dailyProfile(f);
  const nHalf = Math.max(1, Math.round(hours * 2));
  const startSlot = f.facilityLoadMw.length % 48;
  let meanSum = 0;
  let peak = 0;
  for (let k = 0; k < nHalf; k++) {
    const slot = profile[(startSlot + k) % 48];
    meanSum += slot.mean;
    peak = Math.max(peak, slot.mean + 1.5 * slot.sd);
  }
  return {
    hours,
    expected_mean_mw: +(meanSum / nHalf).toFixed(2),
    expected_peak_mw: +peak.toFixed(2),
  };
}

function simulateAllocation(f: FacilitySnapshot, mw: number, hours: number) {
  const a = analyzeCapacity(f, 0.5);
  const projectedPeak = a.coincidentPeakMw + mw; // worst case: new load fully coincident
  const breachesN1 = projectedPeak > a.usableMw;
  return {
    request_mw: mw,
    hours,
    current_peak_mw: +a.coincidentPeakMw.toFixed(2),
    projected_peak_mw: +projectedPeak.toFixed(2),
    usable_after_n1_mw: +a.usableMw.toFixed(2),
    headroom_after_mw: +(a.usableMw - projectedPeak).toFixed(2),
    reclaimable_budget_mw: +a.reclaimableMw.toFixed(2),
    breaches_n1_reserve: breachesN1,
    safe_to_grant: !breachesN1,
  };
}

async function proposeSchedule(mw: number, hours: number) {
  const g = await getGridConditions();
  const f = g.forecast;
  const nHalf = Math.max(1, Math.round(hours * 2));
  let best: { from: string; carbon: number; price: number | null; score: number } | null = null;
  for (let i = 0; i + nHalf <= f.length; i++) {
    const win = f.slice(i, i + nHalf);
    const avgCarbon = win.reduce((a, p) => a + p.carbon, 0) / nHalf;
    const priced = win.filter((p) => p.pricePPerKwh != null);
    const avgPrice = priced.length
      ? priced.reduce((a, p) => a + (p.pricePPerKwh ?? 0), 0) / priced.length
      : null;
    const score = avgCarbon + (avgPrice != null ? avgPrice * 2 : 0);
    if (!best || score < best.score) best = { from: win[0].from, carbon: avgCarbon, price: avgPrice, score };
  }
  if (!best) return { error: "no forecast window available" };

  const energyKwh = mw * 1000 * hours;
  const now = g.current;
  const co2SavedTonnes = ((now.carbon - best.carbon) * energyKwh) / 1e6;
  const gbpSaved =
    now.pricePPerKwh != null && best.price != null
      ? ((now.pricePPerKwh - best.price) * energyKwh) / 100
      : null;
  return {
    window_start: best.from,
    window_avg_carbon_gco2_kwh: Math.round(best.carbon),
    window_avg_price_p_kwh: best.price != null ? +best.price.toFixed(1) : null,
    now_carbon_gco2_kwh: now.carbon,
    now_price_p_kwh: now.pricePPerKwh != null ? +now.pricePPerKwh.toFixed(1) : null,
    co2_saved_tonnes: +co2SavedTonnes.toFixed(2),
    gbp_saved: gbpSaved != null ? Math.round(gbpSaved) : null,
  };
}

// --- tool definitions ------------------------------------------------------
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_headroom",
    description:
      "Current facility capacity: installed grid connection, usable capacity after the N+1 redundancy reserve, capacity already sold to tenants, real coincident peak, risk-adjusted planning ceiling, reclaimable MW, and breach probability.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_grid_conditions",
    description:
      "Live UK grid: current carbon intensity (gCO2/kWh) and index, renewable %, dynamic import price (Octopus Agile, p/kWh), and the greenest and cheapest upcoming windows.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_load_forecast",
    description: "Near-term facility load forecast for the next N hours (expected mean and peak MW).",
    input_schema: {
      type: "object",
      properties: { hours: { type: "number", description: "Forecast horizon in hours (1-48)" } },
      required: ["hours"],
    },
  },
  {
    name: "simulate_allocation",
    description:
      "Simulate accepting a new tenant/workload of the given size. Returns projected coincident peak, whether it breaches the N+1 reserve or the planning ceiling, and whether it is safe to grant.",
    input_schema: {
      type: "object",
      properties: {
        mw: { type: "number", description: "Requested power in MW" },
        hours: { type: "number", description: "Duration in hours" },
      },
      required: ["mw", "hours"],
    },
  },
  {
    name: "propose_schedule",
    description:
      "For a flexible workload, find the greenest+cheapest upcoming window to run it and quantify the CO2 (tonnes) and £ saved versus running now.",
    input_schema: {
      type: "object",
      properties: {
        mw: { type: "number", description: "Workload power in MW" },
        hours: { type: "number", description: "Workload duration in hours" },
      },
      required: ["mw", "hours"],
    },
  },
];

async function runTool(f: FacilitySnapshot, name: string, input: Record<string, unknown>) {
  switch (name) {
    case "get_headroom": {
      const a = analyzeCapacity(f, 0.5);
      return {
        installed_mw: a.installedMw,
        usable_after_n1_mw: +a.usableMw.toFixed(2),
        redundancy: f.config.redundancy,
        reserve_mw: f.config.redundancyReserveMw,
        sold_to_tenants_mw: +a.contractedFacilityMw.toFixed(2),
        coincident_peak_mw: +a.coincidentPeakMw.toFixed(2),
        planning_ceiling_mw: +a.planningCeilingMw.toFixed(2),
        reclaimable_mw: +a.reclaimableMw.toFixed(2),
        breach_probability_pct: +a.breachProbabilityPct.toFixed(1),
      };
    }
    case "get_grid_conditions": {
      const g = await getGridConditions();
      return {
        carbon_gco2_kwh: g.current.carbon,
        carbon_index: g.current.index,
        renewable_pct: +g.current.renewablePct.toFixed(0),
        price_p_kwh: g.current.pricePPerKwh != null ? +g.current.pricePPerKwh.toFixed(1) : null,
        greenest_window: g.greenestWindow,
        cheapest_window: g.cheapestWindow,
      };
    }
    case "get_load_forecast":
      return forecastLoad(f, Number(input.hours ?? 24));
    case "simulate_allocation":
      return simulateAllocation(f, Number(input.mw ?? 0), Number(input.hours ?? 1));
    case "propose_schedule":
      return await proposeSchedule(Number(input.mw ?? 0), Number(input.hours ?? 1));
    default:
      return { error: `unknown tool ${name}` };
  }
}

function systemPrompt(f: FacilitySnapshot): string {
  return `You are the Energy Copilot for ${f.config.name} (${f.config.location}), the operator-facing assistant in an Energy OS for data centers. You help the operator decide whether to accept new AI-tenant capacity requests and when to run flexible workloads, grounded in live facility headroom and live UK grid data.

Tools: get_headroom, get_grid_conditions, get_load_forecast, simulate_allocation, propose_schedule. Always call tools for numbers — never invent figures. For any capacity request, call simulate_allocation before answering.

SAFETY GUARDRAIL (non-negotiable): you never auto-approve an unsafe allocation. If simulate_allocation returns breaches_n1_reserve=true, you must NOT say it is granted. Flag it clearly as REQUIRING HUMAN OPERATOR SIGN-OFF, state that it would push the projected peak above usable capacity and eat into the N+1 reserve (say by how many MW), and offer safer alternatives (smaller MW, shorter duration, or scheduling into a low-demand/low-carbon window via propose_schedule). When safe_to_grant=true but headroom_after_mw is thin (under ~0.5 MW), recommend granting WITH CONDITIONS (monitor closely). For comfortable safe requests you may recommend granting — but always frame it as a recommendation for the operator, not an executed action. You propose; the human decides and executes. This is what lets an operator sell capacity with confidence.

For flexible workloads, use propose_schedule and quantify the £ and CO2 saved versus running now.

Style: concise and decisive. Lead with the verdict (GRANT / GRANT WITH CONDITIONS / DEFER TO OPERATOR / SCHEDULE), then the key numbers, then one line of reasoning. Units: MW, £, gCO2/kWh. No preamble.`;
}

// --- rate limiting (best-effort, per-instance) -----------------------------
const hits: number[] = [];
function rateLimited(): boolean {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  while (hits.length && hits[0] < now - windowMs) hits.shift();
  if (hits.length >= 40) return true;
  hits.push(now);
  return false;
}

export interface TraceStep {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
}

export interface CopilotResult {
  reply: string;
  trace: TraceStep[];
  error?: string;
}

export async function runCopilot(
  turns: { role: "user" | "assistant"; content: string }[],
): Promise<CopilotResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      reply:
        "The copilot needs an ANTHROPIC_API_KEY to run. It's disabled in this deployment — the dashboard and grid data above are fully live. (Ask me to walk you through the code.)",
      trace: [],
      error: "no_api_key",
    };
  }
  if (rateLimited()) {
    return { reply: "The demo copilot is busy right now — give it a minute and try again.", trace: [], error: "rate_limited" };
  }

  const f = getFacility();
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const trace: TraceStep[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: systemPrompt(f),
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "(no response)", trace };
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const result = await runTool(f, block.name, (block.input ?? {}) as Record<string, unknown>);
      trace.push({ tool: block.name, input: (block.input ?? {}) as Record<string, unknown>, result });
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: "I reached my step limit working that out — try narrowing the question.", trace, error: "max_iterations" };
}
