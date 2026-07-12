import { z } from "zod";
import { headroom, listRequests, resetLedger, submitRequest } from "@/lib/orchestration";

const Body = z.object({
  tenant: z.string().min(1).max(60),
  mw: z.number().positive().max(20),
  hours: z.number().positive().max(168),
  priority: z.enum(["standard", "high"]).default("standard"),
});

export async function GET() {
  return Response.json({ headroom: headroom(), requests: listRequests() });
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const result = submitRequest(parsed.data);
  return Response.json({ request: result, headroom: headroom() }, { status: 201 });
}

export async function DELETE() {
  resetLedger();
  return Response.json({ headroom: headroom(), requests: [] });
}
