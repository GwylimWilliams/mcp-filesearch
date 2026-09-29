import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFixture, type Fixture } from "./fixtures.js";
import { connect, textOf, type Harness } from "./harness.js";

interface MatchEntry {
  file: string;
  line: number;
  column: number;
  text: string;
  context?: { line: number; text: string }[];
}

function matchesOf(result: Record<string, unknown>): MatchEntry[] {
  return result.matches as MatchEntry[];
}

describe("search_content", () => {
  describe("with a single root", () => {
    let fixture: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      fixture = createFixture("search", {
        "notes.md": "first line\nsecond line has NEEDLE here\nthird line\n",
        "ignored.md": "needle ignored\n",
        ".gitignore": "ignored.md\n",
        ".git/secret.md": "needle in secret\n",
        ".chrome-data/cache.md": "needle in cache\n",
        "docs/inner.md": "needle inner\n",
        "literal.txt": "a.b[ here\naxb not here\n",
        "multi.md": "foo foo foo\n",
        "unicode.md": "héllo needle world\n",
        "ctx.md": "one\ncontext above\nTARGET here\ncontext below\nfive\nsix\n",
        "edge.md": "TARGET first\nsecond\nthird\nfourth\n",
        "binary.dat": Buffer.from("\x00\x00needle\x00\n", "latin1"),
        "invalid.txt": Buffer.from("caf\xe9 needle here\n", "latin1"),
        "evil.txt": `${"a".repeat(5000)}b\n`,
        "long.txt": `needle${"x".repeat(5000)}\n`,
      });
      mcp = await connect([fixture.root]);
    });

    afterEach(async () => {
      await mcp.close();
      fixture.cleanup();
    });

    it("returns each matching line with its file, line, column and text", async () => {
      const result = await mcp.callOk("search_content", { pattern: "needle", glob: "*.md" });
      expect(matchesOf(result).sort((a, b) => a.file.localeCompare(b.file))).toEqual([
        { file: join("docs", "inner.md"), line: 1, column: 1, text: "needle inner" },
        { file: "ignored.md", line: 1, column: 1, text: "needle ignored" },
        { file: "notes.md", line: 2, column: 17, text: "second line has NEEDLE here" },
        { file: "unicode.md", line: 1, column: 7, text: "héllo needle world" },
      ]);
      expect(result.count).toBe(4);
      expect(result.truncated).toBe(false);
    });

    it("returns one entry per matching line when a line has several matches", async () => {
      const result = await mcp.callOk("search_content", { pattern: "foo", glob: "multi.md" });
      expect(result.matches).toEqual([
        { file: "multi.md", line: 1, column: 1, text: "foo foo foo" },
      ]);
      expect(result.count).toBe(1);
    });

    it("counts characters, not bytes, for the column", async () => {
      // "héllo " is six characters but seven bytes; the é must count as one.
      const result = await mcp.callOk("search_content", { pattern: "needle", glob: "unicode.md" });
      expect(result.matches).toEqual([
        { file: "unicode.md", line: 1, column: 7, text: "héllo needle world" },
      ]);
    });

    it("adds surrounding lines when contextLines is set", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "TARGET",
        glob: "ctx.md",
        contextLines: 1,
      });
      expect(result.matches).toEqual([
        {
          file: "ctx.md",
          line: 3,
          column: 1,
          text: "TARGET here",
          context: [
            { line: 2, text: "context above" },
            { line: 4, text: "context below" },
          ],
        },
      ]);
    });

    it("widens context to the requested line count, in file order", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "TARGET",
        glob: "ctx.md",
        contextLines: 2,
      });
      expect(matchesOf(result)[0].context).toEqual([
        { line: 1, text: "one" },
        { line: 2, text: "context above" },
        { line: 4, text: "context below" },
        { line: 5, text: "five" },
      ]);
    });

    it("never asks for context beyond the file's edges", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "TARGET",
        glob: "edge.md",
        contextLines: 2,
      });
      expect(matchesOf(result)[0].context).toEqual([
        { line: 2, text: "second" },
        { line: 3, text: "third" },
      ]);
    });

    it("returns no context field at all when contextLines is 0", async () => {
      const result = await mcp.callOk("search_content", { pattern: "TARGET", glob: "ctx.md" });
      expect(result.matches).toEqual([{ file: "ctx.md", line: 3, column: 1, text: "TARGET here" }]);
    });

    it("treats the pattern as a regular expression by default", async () => {
      // "a.b" matches both "a.b" and "axb".
      const result = await mcp.callOk("search_content", { pattern: "a.b", glob: "literal.txt" });
      expect(matchesOf(result).map((match) => match.line)).toEqual([1, 2]);
      expect(result.count).toBe(2);
    });

    it("treats the pattern literally when fixedStrings is true", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "a.b[",
        glob: "literal.txt",
        fixedStrings: true,
      });
      expect(result.matches).toEqual([
        { file: "literal.txt", line: 1, column: 1, text: "a.b[ here" },
      ]);
      expect(result.count).toBe(1);
    });

    it("rejects an unparseable pattern as a clean tool error", async () => {
      const result = await mcp.callError("search_content", { pattern: "a.b[", glob: "literal.txt" });
      const message = textOf(result);
      expect(message).toContain("exited with code 2");
      expect(message).not.toMatch(/\n\s*at /);
      expect(result.structuredContent).toBeUndefined();
    });

    it("defaults to case-insensitive matching and honours caseSensitive", async () => {
      const insensitive = await mcp.callOk("search_content", { pattern: "needle", glob: "*.md" });
      expect(insensitive.count).toBe(4);

      const sensitive = await mcp.callOk("search_content", {
        pattern: "needle",
        glob: "*.md",
        caseSensitive: true,
      });
      expect(
        matchesOf(sensitive)
          .map((match) => match.file)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual([join("docs", "inner.md"), "ignored.md", "unicode.md"]);
      expect(sensitive.count).toBe(3);
    });

    it("restricts the search to files matching the glob", async () => {
      const result = await mcp.callOk("search_content", { pattern: "needle", glob: "docs/*.md" });
      expect(matchesOf(result).map((match) => match.file)).toEqual([join("docs", "inner.md")]);
      expect(result.count).toBe(1);
    });

    it("searches files that .gitignore would hide, because VCS ignores are off by default", async () => {
      const result = await mcp.callOk("search_content", { pattern: "needle", glob: "ignored.md" });
      expect(result.matches).toEqual([
        { file: "ignored.md", line: 1, column: 1, text: "needle ignored" },
      ]);
    });

    it("never searches files under .git or .chrome-data, even when the glob matches", async () => {
      const secret = await mcp.callOk("search_content", { pattern: "needle", glob: "secret.md" });
      expect(secret).toEqual({ matches: [], count: 0, truncated: false });
      const cache = await mcp.callOk("search_content", { pattern: "needle", glob: "cache.md" });
      expect(cache).toEqual({ matches: [], count: 0, truncated: false });
    });

    it("returns an empty page, not an error, when nothing matches", async () => {
      expect(await mcp.callOk("search_content", { pattern: "zzz-absent" })).toEqual({
        matches: [],
        count: 0,
        truncated: false,
      });
    });

    it("treats a pattern that looks like a flag as a literal pattern, executing nothing", async () => {
      const canary = join(fixture.root, "pwned");
      const smuggled = await mcp.callOk("search_content", {
        pattern: `--pre=touch ${canary}`,
      });
      expect(smuggled).toEqual({ matches: [], count: 0, truncated: false });
      expect(existsSync(canary)).toBe(false);

      expect((await mcp.callOk("search_content", { pattern: "--files" })).count).toBe(0);
    });

    it("rejects a path outside the roots before any subprocess could run", async () => {
      const traversal = await mcp.callError("search_content", {
        pattern: "needle",
        path: "../../etc/passwd",
      });
      expect(textOf(traversal)).toMatch(/cannot be resolved|outside the allowed roots/);
      expect(textOf(traversal)).not.toContain("exited with code");

      const absolute = await mcp.callError("search_content", { pattern: "needle", path: "/etc" });
      expect(textOf(absolute)).toContain("outside the allowed roots");
      expect(textOf(absolute)).not.toContain("exited with code");
    });

    it("completes a catastrophic-looking regex quickly", async () => {
      const started = Date.now();
      const result = await mcp.callOk("search_content", { pattern: "(a+)+$", glob: "evil.txt" });
      expect(Date.now() - started).toBeLessThan(1000);
      expect(result).toEqual({ matches: [], count: 0, truncated: false });
    });

    it("caps a very long line's text and flags truncation", async () => {
      const result = await mcp.callOk("search_content", { pattern: "needle", glob: "long.txt" });
      const [match] = matchesOf(result);
      expect(result.count).toBe(1);
      expect(result.truncated).toBe(true);
      expect(match.text.startsWith("needle")).toBe(true);
      expect(match.text.endsWith("…")).toBe(true);
      expect(match.text.length).toBe(501);
    });

    it("searches a binary file without leaking control characters", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "needle",
        path: join(fixture.root, "binary.dat"),
      });
      expect(result.matches).toEqual([
        { file: "binary.dat", line: 1, column: 1, text: "needle" },
      ]);
      expect(result.count).toBe(1);
    });

    it("returns replacement characters for invalid UTF-8 without crashing", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "needle",
        path: join(fixture.root, "invalid.txt"),
      });
      expect(result.matches).toEqual([
        { file: "invalid.txt", line: 1, column: 6, text: "caf\uFFFD needle here" },
      ]);
      expect(result.count).toBe(1);
    });

    it("returns structured content mirroring the text payload", async () => {
      const result = await mcp.client.callTool({
        name: "search_content",
        arguments: { pattern: "needle", glob: "notes.md" },
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

      const tool = tools.find((candidate) => candidate.name === "search_content");
      expect(tool?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
      expect(tool?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
          glob: { type: "string" },
          fixedStrings: { type: "boolean", default: false },
          caseSensitive: { type: "boolean", default: false },
          contextLines: { type: "integer", minimum: 0, maximum: 10, default: 0 },
          maxResults: { type: "integer", minimum: 1, maximum: 500, default: 100 },
        },
        required: ["pattern"],
      });
      expect(tool?.outputSchema).toMatchObject({
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                line: { type: "number" },
                column: { type: "number" },
                text: { type: "string" },
                context: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { line: { type: "number" }, text: { type: "string" } },
                  },
                },
              },
              required: ["file", "line", "column", "text"],
            },
          },
          count: { type: "number" },
          truncated: { type: "boolean" },
        },
        required: ["matches", "count", "truncated"],
      });
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
        input: "contextLines of the wrong type",
        args: { pattern: "x", contextLines: "1" },
        field: "contextLines",
      },
      {
        input: "contextLines above the maximum",
        args: { pattern: "x", contextLines: 11 },
        field: "contextLines",
      },
      {
        input: "a negative contextLines",
        args: { pattern: "x", contextLines: -1 },
        field: "contextLines",
      },
      {
        input: "a fractional contextLines",
        args: { pattern: "x", contextLines: 1.5 },
        field: "contextLines",
      },
      {
        input: "maxResults of the wrong type",
        args: { pattern: "x", maxResults: "10" },
        field: "maxResults",
      },
      {
        input: "maxResults above the maximum",
        args: { pattern: "x", maxResults: 501 },
        field: "maxResults",
      },
      { input: "maxResults of zero", args: { pattern: "x", maxResults: 0 }, field: "maxResults" },
      {
        input: "a fractional maxResults",
        args: { pattern: "x", maxResults: 2.5 },
        field: "maxResults",
      },
    ])("rejects $input at the schema", async ({ args, field }) => {
      const result = await mcp.callError("search_content", args);
      const message = textOf(result);
      expect(message).toContain("Input validation error");
      expect(message).toContain(field);
      expect(result.structuredContent).toBeUndefined();
    });
  });

  describe("on a large match set", () => {
    let fixture: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      fixture = createFixture("search-large", {
        "big.txt": `${Array.from({ length: 5000 }, () => "hit").join("\n")}\n`,
      });
      mcp = await connect([fixture.root]);
    });

    afterEach(async () => {
      await mcp.close();
      fixture.cleanup();
    });

    it("returns at most maxResults entries but reports the true count", async () => {
      const result = await mcp.callOk("search_content", { pattern: "hit" });
      const matches = matchesOf(result);
      expect(matches).toHaveLength(100);
      expect(matches[0]).toEqual({ file: "big.txt", line: 1, column: 1, text: "hit" });
      expect(matches[99].line).toBe(100);
      expect(result.count).toBe(5000);
      expect(result.truncated).toBe(true);
    });

    it("honours a smaller maxResults", async () => {
      const result = await mcp.callOk("search_content", { pattern: "hit", maxResults: 3 });
      expect(matchesOf(result).map((match) => match.line)).toEqual([1, 2, 3]);
      expect(result.count).toBe(5000);
      expect(result.truncated).toBe(true);
    });
  });

  describe("with several roots", () => {
    let first: Fixture;
    let second: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      first = createFixture("search-multi-a", { "one.md": "target here\n" });
      second = createFixture("search-multi-b", { "sub/two.md": "target here\n" });
      mcp = await connect([first.root, second.root]);
    });

    afterEach(async () => {
      await mcp.close();
      first.cleanup();
      second.cleanup();
    });

    it("requires an explicit path", async () => {
      const result = await mcp.callError("search_content", { pattern: "target" });
      expect(textOf(result)).toMatch(/path is required/);
      expect(result.structuredContent).toBeUndefined();
    });

    it("searches only inside the chosen root, relative to that root", async () => {
      const inSecond = await mcp.callOk("search_content", { pattern: "target", path: second.root });
      expect(inSecond.matches).toEqual([
        { file: join("sub", "two.md"), line: 1, column: 1, text: "target here" },
      ]);

      const inFirst = await mcp.callOk("search_content", { pattern: "target", path: first.root });
      expect(inFirst.matches).toEqual([
        { file: "one.md", line: 1, column: 1, text: "target here" },
      ]);
    });
  });
});
