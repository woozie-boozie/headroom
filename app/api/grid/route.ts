import { getGridConditions } from "@/lib/grid";

export const revalidate = 900; // 15 min — the grid publishes half-hourly

export async function GET() {
  const data = await getGridConditions();
  return Response.json(data, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
  });
}
