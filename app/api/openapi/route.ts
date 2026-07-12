// A small, honest OpenAPI description of the orchestration surface — the
// operator↔tenant capacity market. Served at /api/openapi.
const spec = {
  openapi: "3.0.3",
  info: {
    title: "Headroom — Capacity Orchestration API",
    version: "0.1.0",
    description:
      "Operator↔tenant capacity market for a data center. Tenants request power; the operator evaluates each request against live usable headroom (grid connection minus the N+1 reserve minus committed capacity) and grants, partially grants, or denies.",
  },
  paths: {
    "/api/facility/headroom": {
      get: {
        summary: "Current usable headroom",
        responses: {
          "200": {
            description: "Live headroom snapshot",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Headroom" } } },
          },
        },
      },
    },
    "/api/capacity-requests": {
      get: {
        summary: "List capacity requests + current headroom",
        responses: { "200": { description: "Ledger + headroom" } },
      },
      post: {
        summary: "Submit a tenant capacity request",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CapacityRequestInput" } } },
        },
        responses: {
          "201": { description: "Evaluated request + updated headroom" },
          "400": { description: "Invalid request" },
        },
      },
      delete: { summary: "Reset the demo ledger", responses: { "200": { description: "Cleared" } } },
    },
  },
  components: {
    schemas: {
      Headroom: {
        type: "object",
        properties: {
          usableMw: { type: "number", description: "Grid connection minus N+1 reserve" },
          baselineLoadMw: { type: "number", description: "Existing coincident peak" },
          committedMw: { type: "number", description: "Already granted to new tenants" },
          availableMw: { type: "number", description: "Remaining safe-to-grant headroom" },
        },
      },
      CapacityRequestInput: {
        type: "object",
        required: ["tenant", "mw", "hours"],
        properties: {
          tenant: { type: "string", maxLength: 60 },
          mw: { type: "number", minimum: 0, maximum: 20 },
          hours: { type: "number", minimum: 0, maximum: 168 },
          priority: { type: "string", enum: ["standard", "high"], default: "standard" },
        },
      },
    },
  },
} as const;

export async function GET() {
  return Response.json(spec);
}
