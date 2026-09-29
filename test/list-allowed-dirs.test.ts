import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, textOf, type Harness } from "./harness.js";

describe("list_allowed_dirs", () => {
  let mcp: Harness;
  let roots: string[];

  beforeEach(async () => {
    roots = [
      realpathSync(mkdtempSync(join(tmpdir(), "mcp-filesearch-roots-a-"))),
      realpathSync(mkdtempSync(join(tmpdir(), "mcp-filesearch-roots-b-"))),
    ];
    mcp = await connect(roots);
  });

  afterEach(async () => {
    await mcp.close();
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  });

  it("returns exactly the configured roots, in order", async () => {
    expect(await mcp.callOk("list_allowed_dirs")).toEqual({ directories: roots });
  });

  it("is listed with read-only annotations and an empty input schema", async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_datetime",
      "list_allowed_dirs",
      "list_matching_files",
      "count_matches",
    ]);

    const tool = tools.find((candidate) => candidate.name === "list_allowed_dirs");
    expect(tool?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
    expect(tool?.inputSchema).toMatchObject({ type: "object", properties: {} });
    expect(tool?.outputSchema).toMatchObject({
      type: "object",
      properties: { directories: { type: "array", items: { type: "string" } } },
      required: ["directories"],
    });
  });

  it("returns structured content mirroring the text payload", async () => {
    const result = await mcp.client.callTool({ name: "list_allowed_dirs", arguments: {} });
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
  });
});
