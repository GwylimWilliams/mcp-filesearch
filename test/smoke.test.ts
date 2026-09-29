import { afterEach, beforeEach, expect, it } from "vitest";
import { connect, type Harness } from "./harness.js";

let mcp: Harness;

beforeEach(async () => {
  mcp = await connect(["/tmp"]);
});

afterEach(async () => {
  await mcp.close();
});

it("completes the handshake and lists the registered tools, get_datetime's contract intact", async () => {
  const { tools } = await mcp.client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual(["get_datetime", "list_allowed_dirs"]);

  const tool = tools[0];
  expect(tool?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
  expect(tool?.inputSchema).toMatchObject({
    type: "object",
    properties: {
      timezone: { type: "string", default: "UTC" },
      offsetDays: { type: "integer", minimum: -365, maximum: 365, default: 0 },
      format: { type: "string", enum: ["iso", "unix", "human"], default: "iso" },
    },
  });
  expect(tool?.outputSchema).toMatchObject({
    type: "object",
    required: ["iso", "unix", "timezone"],
    additionalProperties: false,
  });
});
