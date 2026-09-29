import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFixture, type Fixture } from "./fixtures.js";
import { connect, textOf, type Harness } from "./harness.js";

interface FileCount {
  file: string;
  count: number;
}

function sorted(counts: unknown): FileCount[] {
  return [...(counts as FileCount[])].sort((a, b) => a.file.localeCompare(b.file));
}

describe("count_matches", () => {
  describe("with a single root", () => {
    let fixture: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      fixture = createFixture("count", {
        "a.md": "alpha\nbeta\nALPHA\n",
        "docs/b.md": "alpha alpha\ngamma\n",
        "docs/c.txt": "gamma\n",
        ".gitignore": "ignored.md\n",
        "ignored.md": "alpha\n",
        ".git/secret.md": "alpha\n",
        ".chrome-data/cache.md": "alpha\n",
        "literal.txt": "a.b axb\n",
      });
      mcp = await connect([fixture.root]);
    });

    afterEach(async () => {
      await mcp.close();
      fixture.cleanup();
    });

    it("counts matching lines per file, as paths relative to the root", async () => {
      const result = await mcp.callOk("count_matches", { pattern: "alpha" });
      expect(sorted(result.counts)).toEqual([
        { file: "a.md", count: 2 },
        { file: join("docs", "b.md"), count: 1 },
        { file: "ignored.md", count: 1 },
      ]);
      expect(result.total).toBe(4);
      expect(result.truncated).toBe(false);
    });

    it("counts every match, not every line, when countLines is false", async () => {
      const result = await mcp.callOk("count_matches", { pattern: "alpha", countLines: false });
      expect(sorted(result.counts)).toEqual([
        { file: "a.md", count: 2 },
        { file: join("docs", "b.md"), count: 2 },
        { file: "ignored.md", count: 1 },
      ]);
      expect(result.total).toBe(5);
    });

    it("defaults to case-insensitive matching and honours caseSensitive", async () => {
      expect((await mcp.callOk("count_matches", { pattern: "alpha" })).total).toBe(4);

      const sensitive = await mcp.callOk("count_matches", {
        pattern: "alpha",
        caseSensitive: true,
      });
      expect(sorted(sensitive.counts)).toEqual([
        { file: "a.md", count: 1 },
        { file: join("docs", "b.md"), count: 1 },
        { file: "ignored.md", count: 1 },
      ]);
      expect(sensitive.total).toBe(3);
    });

    it("treats the pattern as a regular expression by default and literally with fixedStrings", async () => {
      // "a.b" matches both "a.b" and "axb" as a regex, but only "a.b" literally.
      expect((await mcp.callOk("count_matches", { pattern: "a.b", countLines: false })).total).toBe(2);

      const fixed = await mcp.callOk("count_matches", {
        pattern: "a.b",
        fixedStrings: true,
        countLines: false,
      });
      expect(fixed.total).toBe(1);
    });

    it("restricts counting to files matching the glob", async () => {
      const byExtension = await mcp.callOk("count_matches", { pattern: "gamma", glob: "*.txt" });
      expect(byExtension.counts).toEqual([{ file: join("docs", "c.txt"), count: 1 }]);
      expect(byExtension.total).toBe(1);

      const withSlash = await mcp.callOk("count_matches", { pattern: "alpha", glob: "docs/*.md" });
      expect(withSlash.counts).toEqual([{ file: join("docs", "b.md"), count: 1 }]);
      expect(withSlash.total).toBe(1);
    });

    it("counts files that .gitignore would hide, because VCS ignores are off by default", async () => {
      const result = await mcp.callOk("count_matches", { pattern: "alpha", glob: "ignored.md" });
      expect(result.counts).toEqual([{ file: "ignored.md", count: 1 }]);
    });

    it("never counts files under .git or .chrome-data, even when the glob matches", async () => {
      const secret = await mcp.callOk("count_matches", { pattern: "alpha", glob: "secret.md" });
      expect(secret.counts).toEqual([]);
      const cache = await mcp.callOk("count_matches", { pattern: "alpha", glob: "cache.md" });
      expect(cache.counts).toEqual([]);
    });

    it("returns zero counts, not an error, when nothing matches", async () => {
      expect(await mcp.callOk("count_matches", { pattern: "zzz" })).toEqual({
        counts: [],
        total: 0,
        truncated: false,
      });
    });

    it("rejects an unparseable pattern as a clean tool error", async () => {
      const result = await mcp.callError("count_matches", { pattern: "[" });
      const message = textOf(result);
      expect(message).toContain("exited with code 2");
      expect(message).not.toMatch(/\n\s*at /);
      expect(result.structuredContent).toBeUndefined();
    });

    it("treats a pattern that looks like a flag as a literal pattern, executing nothing", async () => {
      const canary = join(fixture.root, "pwned");
      const smuggled = await mcp.callOk("count_matches", { pattern: `--pre=touch ${canary}` });
      expect(smuggled).toEqual({ counts: [], total: 0, truncated: false });
      expect(existsSync(canary)).toBe(false);

      expect((await mcp.callOk("count_matches", { pattern: "--files" })).total).toBe(0);
    });

    it("rejects a path outside the roots before any subprocess could run", async () => {
      const traversal = await mcp.callError("count_matches", {
        pattern: "alpha",
        path: "../../etc/passwd",
      });
      expect(textOf(traversal)).toMatch(/cannot be resolved|outside the allowed roots/);
      expect(textOf(traversal)).not.toContain("exited with code");

      const absolute = await mcp.callError("count_matches", { pattern: "alpha", path: "/etc" });
      expect(textOf(absolute)).toContain("outside the allowed roots");
      expect(textOf(absolute)).not.toContain("exited with code");
    });

    it.each([
      { input: "a missing pattern", args: {}, field: "pattern" },
      { input: "a pattern of the wrong type", args: { pattern: 42 }, field: "pattern" },
      { input: "an empty pattern", args: { pattern: "" }, field: "pattern" },
      {
        input: "a pattern over the length limit",
        args: { pattern: "a".repeat(1001) },
        field: "pattern",
      },
      { input: "a path of the wrong type", args: { pattern: "x", path: 42 }, field: "path" },
      { input: "an empty path", args: { pattern: "x", path: "" }, field: "path" },
      { input: "a glob of the wrong type", args: { pattern: "x", glob: 42 }, field: "glob" },
      { input: "an empty glob", args: { pattern: "x", glob: "" }, field: "glob" },
      {
        input: "a glob over the length limit",
        args: { pattern: "x", glob: "g".repeat(501) },
        field: "glob",
      },
      {
        input: "fixedStrings of the wrong type",
        args: { pattern: "x", fixedStrings: "yes" },
        field: "fixedStrings",
      },
      {
        input: "caseSensitive of the wrong type",
        args: { pattern: "x", caseSensitive: 1 },
        field: "caseSensitive",
      },
      {
        input: "countLines of the wrong type",
        args: { pattern: "x", countLines: "no" },
        field: "countLines",
      },
    ])("rejects $input at the schema", async ({ args, field }) => {
      const result = await mcp.callError("count_matches", args);
      const message = textOf(result);
      expect(message).toContain("Input validation error");
      expect(message).toContain(field);
      expect(result.structuredContent).toBeUndefined();
    });

    it("returns structured content mirroring the text payload", async () => {
      const result = await mcp.client.callTool({
        name: "count_matches",
        arguments: { pattern: "alpha" },
      });
      expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
    });

    it("is listed with read-only annotations and its declared schemas", async () => {
      const { tools } = await mcp.client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "get_datetime",
        "list_allowed_dirs",
        "list_matching_files",
        "count_matches",
        "search_content",
      ]);

      const tool = tools.find((candidate) => candidate.name === "count_matches");
      expect(tool?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
      expect(tool?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
          glob: { type: "string" },
          fixedStrings: { type: "boolean", default: false },
          caseSensitive: { type: "boolean", default: false },
          countLines: { type: "boolean", default: true },
        },
        required: ["pattern"],
      });
      expect(tool?.outputSchema).toMatchObject({
        type: "object",
        properties: {
          counts: {
            type: "array",
            items: {
              type: "object",
              properties: { file: { type: "string" }, count: { type: "number" } },
              required: ["file", "count"],
            },
          },
          total: { type: "number" },
          truncated: { type: "boolean" },
        },
        required: ["counts", "total", "truncated"],
      });
    });
  });

  describe("with several roots", () => {
    let first: Fixture;
    let second: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      first = createFixture("count-multi-a", { "a.md": "one\n" });
      second = createFixture("count-multi-b", { "sub/b.md": "one\none\n" });
      mcp = await connect([first.root, second.root]);
    });

    afterEach(async () => {
      await mcp.close();
      first.cleanup();
      second.cleanup();
    });

    it("requires an explicit path", async () => {
      const result = await mcp.callError("count_matches", { pattern: "one" });
      expect(textOf(result)).toMatch(/path is required/);
      expect(result.structuredContent).toBeUndefined();
    });

    it("counts only inside the chosen root, relative to that root", async () => {
      const inSecond = await mcp.callOk("count_matches", { pattern: "one", path: second.root });
      expect(inSecond.counts).toEqual([{ file: join("sub", "b.md"), count: 2 }]);
      expect(inSecond.total).toBe(2);

      const inFirst = await mcp.callOk("count_matches", { pattern: "one", path: first.root });
      expect(inFirst.counts).toEqual([{ file: "a.md", count: 1 }]);
    });
  });

  describe("at the file cap", () => {
    let fixture: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      const files = Object.fromEntries(
        Array.from({ length: 501 }, (_, index) => [`f${String(index).padStart(3, "0")}.md`, "hit\n"]),
      );
      fixture = createFixture("count-cap", files);
      mcp = await connect([fixture.root]);
    });

    afterEach(async () => {
      await mcp.close();
      fixture.cleanup();
    });

    it("returns at most 500 counts but totals every file, flagging truncation", async () => {
      const result = await mcp.callOk("count_matches", { pattern: "hit" });
      expect(result.counts).toHaveLength(500);
      expect(result.total).toBe(501);
      expect(result.truncated).toBe(true);
    });
  });

  describe("on a large match set", () => {
    let fixture: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      fixture = createFixture("count-large", {
        "big.txt": `${Array.from({ length: 5000 }, () => "hit").join("\n")}\n`,
      });
      mcp = await connect([fixture.root]);
    });

    afterEach(async () => {
      await mcp.close();
      fixture.cleanup();
    });

    it("returns one small count per file regardless of how many lines match", async () => {
      const result = await mcp.callOk("count_matches", { pattern: "hit" });
      expect(result).toEqual({
        counts: [{ file: "big.txt", count: 5000 }],
        total: 5000,
        truncated: false,
      });
      expect(JSON.stringify(result).length).toBeLessThan(200);
    });
  });
});
