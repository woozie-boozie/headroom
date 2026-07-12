import { headroom } from "@/lib/orchestration";

export async function GET() {
  return Response.json(headroom());
}
