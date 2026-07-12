import { analyzeCapacity, getFacility } from "@/lib/facility";

// A tiny operator↔tenant capacity market. Tenants submit power requests; the
// operator side evaluates each against live usable headroom (grid connection
// minus the N+1 reserve minus what's already committed) and grants, partially
// grants, or denies. State is in-memory per server instance — fine for a demo,
// resets on cold start.

export type Verdict = "granted" | "partial" | "denied";
export type Priority = "standard" | "high";

export interface CapacityRequest {
  id: string;
  tenant: string;
  requestedMw: number;
  hours: number;
  priority: Priority;
  verdict: Verdict;
  grantedMw: number;
  reason: string;
  at: number;
}

export interface Headroom {
  usableMw: number; // grid connection minus N+1 reserve
  baselineLoadMw: number; // existing coincident peak
  committedMw: number; // already granted to new tenants
  availableMw: number; // what's left to grant
}

const ledger: CapacityRequest[] = [];
let seq = 1;

export function headroom(): Headroom {
  const f = getFacility();
  const a = analyzeCapacity(f, 0.5);
  const committed = ledger
    .filter((r) => r.verdict !== "denied")
    .reduce((s, r) => s + r.grantedMw, 0);
  const available = Math.max(0, a.usableMw - a.coincidentPeakMw - committed);
  return {
    usableMw: +a.usableMw.toFixed(2),
    baselineLoadMw: +a.coincidentPeakMw.toFixed(2),
    committedMw: +committed.toFixed(2),
    availableMw: +available.toFixed(2),
  };
}

export function listRequests(): CapacityRequest[] {
  return [...ledger].reverse();
}

export function resetLedger(): void {
  ledger.length = 0;
  seq = 1;
}

export function submitRequest(input: {
  tenant: string;
  mw: number;
  hours: number;
  priority: Priority;
}): CapacityRequest {
  const before = headroom();
  const mw = Math.max(0, input.mw);
  let verdict: Verdict;
  let grantedMw: number;
  let reason: string;

  if (before.availableMw <= 0.01) {
    verdict = "denied";
    grantedMw = 0;
    reason = "No usable headroom — would breach the N+1 reserve. Reclaim capacity or schedule for a low-demand window.";
  } else if (mw <= before.availableMw + 1e-9) {
    verdict = "granted";
    grantedMw = mw;
    reason = `Fits within ${before.availableMw.toFixed(2)} MW available headroom.`;
  } else {
    verdict = "partial";
    grantedMw = +before.availableMw.toFixed(2);
    reason = `Only ${before.availableMw.toFixed(2)} MW available — granted a partial allocation; ${(mw - before.availableMw).toFixed(2)} MW queued for the operator.`;
  }

  const req: CapacityRequest = {
    id: `req_${String(seq++).padStart(3, "0")}`,
    tenant: input.tenant || "unnamed-tenant",
    requestedMw: mw,
    hours: input.hours,
    priority: input.priority,
    verdict,
    grantedMw,
    reason,
    at: ledger.length, // deterministic ordering marker (no wall-clock in the sim)
  };
  ledger.push(req);
  return req;
}
