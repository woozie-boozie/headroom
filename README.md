# Headroom — a working slice of an Energy OS

A prototype built as a Product Engineer job application. Rather than send a CV, I built the concept
in miniature: **reclaim stranded data-center power**, wired to the **live UK grid**, with an
**operator copilot** that recommends what it safely can and defers anything risky to a human.

> Facility telemetry is simulated (real operator telemetry isn't public). The grid feed is **live**
> and needs no API keys.

## The problem it demonstrates

An operator has a fixed grid connection (here 10 MW) that takes years to upgrade. They've sold ~9.2
MW to tenants on paper, but tenants never all peak together, so real coincident draw is only ~6.3
MW. That gap — minus an N+1 redundancy reserve and a risk buffer — is **sellable capacity** an
operator can let to new AI tenants without waiting for a new grid connection. That's the opportunity;
this is a tool that finds and safely allocates it.

## What's in it

- **Capacity dashboard** — installed vs contracted vs real coincident peak, an oversubscription
  risk slider (with a breach-probability model), a 7-day load chart, the power path, and a tenant
  table showing the demand diversity that creates the opportunity.
- **Live UK grid intelligence** — real-time carbon intensity + 48-hour forecast and generation mix
  ([NESO Carbon Intensity API](https://carbonintensity.org.uk/)) and dynamic import pricing
  ([Octopus Agile](https://developer.octopus.energy/)) — both zero-auth public APIs. Surfaces the
  greenest/cheapest upcoming windows for scheduling flexible load.
- **Energy Copilot** — a Claude agent (tool-use) that reasons over live headroom + grid data to
  advise on tenant requests and scheduling, quantifying £ and CO₂. Its defining behaviour is a
  **hard guardrail**: it never "grants" an allocation that would breach the N+1 reserve — those are
  flagged for human operator sign-off. It proposes; the human executes.
- **Operator↔tenant orchestration API** — a typed capacity market: tenants `POST` requests,
  evaluated against live usable headroom, returned as grant / partial / denied. Published OpenAPI
  spec at `/api/openapi`.

## Stack

Next.js (App Router) + TypeScript + React + Tailwind + Recharts, deployed on Vercel. Grid data via
server-side route handlers with short caching + graceful fallback. The copilot uses the
[Anthropic SDK](https://www.npmjs.com/package/@anthropic-ai/sdk) (`claude-sonnet-5`).

## Run it

```bash
npm install
npm run dev   # http://localhost:3000
```

The dashboard and live grid work out of the box. The Copilot needs a Claude API key:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

Without a key the Copilot shows a friendly "disabled" message; everything else stays live.

---

Built by [Akhil Madan](https://keedastudios.com).
