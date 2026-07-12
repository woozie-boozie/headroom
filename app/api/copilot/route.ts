import { z } from "zod";
import { runCopilot } from "@/lib/copilot";

export const maxDuration = 30;

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const result = await runCopilot(parsed.data.messages);
  return Response.json(result);
}
