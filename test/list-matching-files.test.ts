import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFixture, type Fixture } from "./fixtures.js";
import { connect, textOf, type Harness } from "./harness.js";

function sorted(files: unknown): string[] {
  return [...(files as string[])].sort();
}

describe("list_matching_files", () => {
  describe("with a single root", () => {
    let fixture: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      fixture = createFixture("list-files", {
        "readme.md": "# readme\n",
        "docs/guide.md": "# guide\n",
        "docs/notes.txt": "notes\n",
        "src/app.ts": "export {};\n",
        ".gitignore": "ignored.md\n",
        "ignored.md": "hidden by .gitignore\n",
        ".git/secret.md": "secret\n",
        ".chrome-data/cache.md": "cache\n",
        "-e": "smuggle\n",
        "--files": "smuggle\n",
      });
      mcp = await connect([fixture.root]);
    });

    afterEach(async () => {
      await mcp.close();
      fixture.cleanup();
    });

    it("lists glob matches relative to the root when path is omitted", async () => {
      const result = await mcp.callOk("list_matching_files", { glob: "*.md" });
      expect(sorted(result.files)).toEqual([
        join("docs", "guide.md"),
        "ignored.md",
        "readme.md",
      ]);
      expect(result.truncated).toBe(false);
    });

    it("lists files that .gitignore would hide, because VCS ignores are off by default", async () => {
      const result = await mcp.callOk("list_matching_files", { glob: "ignored.md" });
      expect(result.files).toEqual(["ignored.md"]);
    });

    it("scopes an explicit path and still returns paths relative to the root", async () => {
      const result = await mcp.callOk("list_matching_files", {
        glob: "*.md",
        path: join(fixture.root, "docs"),
      });
      expect(result.files).toEqual([join("docs", "guide.md")]);
    });

    it("treats globs beginning with dashes as literal globs, never flags", async () => {
      expect((await mcp.callOk("list_matching_files", { glob: "-e" })).files).toEqual(["-e"]);
      expect((await mcp.callOk("list_matching_files", { glob: "--files" })).files).toEqual([
        "--files",
      ]);
    });

    it("never lists files under .git or .chrome-data, even when the glob matches", async () => {
      expect((await mcp.callOk("list_matching_files", { glob: "secret.md" })).files).toEqual([]);
      expect((await mcp.callOk("list_matching_files", { glob: "cache.md" })).files).toEqual([]);
    });

    it("filters with exclude globs", async () => {
      const result = await mcp.callOk("list_matching_files", {
        glob: "*.md",
        exclude: ["docs/*.md"],
      });
      expect(sorted(result.files)).toEqual(["ignored.md", "readme.md"]);
    });

    it("returns an empty list, not an error, when nothing matches", async () => {
      expect(await mcp.callOk("list_matching_files", { glob: "*.zzz" })).toEqual({
        files: [],
        truncated: false,
      });
    });

    it("rejects an unparseable glob as a clean tool error", async () => {
      const result = await mcp.callError("list_matching_files", { glob: "[" });
      const message = textOf(result);
      expect(message).toContain("exited with code 2");
      expect(message).not.toMatch(/\n\s*at /);
      expect(result.structuredContent).toBeUndefined();
    });

    it("rejects a path outside the roots before any subprocess could run", async () => {
      const traversal = await mcp.callError("list_matching_files", {
        glob: "*.md",
        path: "../../etc/passwd",
      });
      expect(textOf(traversal)).toMatch(/cannot be resolved|outside the allowed roots/);
      expect(textOf(traversal)).not.toContain("exited with code");

      const absolute = await mcp.callError("list_matching_files", { glob: "*.md", path: "/etc" });
      expect(textOf(absolute)).toContain("outside the allowed roots");
      expect(textOf(absolute)).not.toContain("exited with code");
    });

    it.each([
      { input: "a glob of the wrong type", args: { glob: 42 }, field: "glob" },
      { input: "a missing glob", args: {}, field: "glob" },
      { input: "an empty glob", args: { glob: "" }, field: "glob" },
      { input: "a glob over the length limit", args: { glob: "a".repeat(501) }, field: "glob" },
      { input: "a path of the wrong type", args: { glob: "*.md", path: 42 }, field: "path" },
      { input: "an empty path", args: { glob: "*.md", path: "" }, field: "path" },
      {
        input: "an exclude of the wrong type",
        args: { glob: "*.md", exclude: "*.txt" },
        field: "exclude",
      },
      {
        input: "an exclude item of the wrong type",
        args: { glob: "*.md", exclude: [42] },
        field: "exclude",
      },
      {
        input: "an empty exclude item",
        args: { glob: "*.md", exclude: [""] },
        field: "exclude",
      },
    ])("rejects $input at the schema", async ({ args, field }) => {
      const result = await mcp.callError("list_matching_files", args);
      const message = textOf(result);
      expect(message).toContain("Input validation error");
      expect(message).toContain(field);
      expect(result.structuredContent).toBeUndefined();
    });

    it("returns structured content mirroring the text payload", async () => {
      const result = await mcp.client.callTool({
        name: "list_matching_files",
        arguments: { glob: "*.md" },
      });
      expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
    });

    it("is listed with read-only annotations and its declared schemas", async () => {
      const { tools } = await mcp.client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "get_datetime",
        "list_allowed_dirs",
        "list_matching_files",
      ]);

      const tool = tools.find((candidate) => candidate.name === "list_matching_files");
      expect(tool?.annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
      expect(tool?.inputSchema).toMatchObject({
        type: "object",
        properties: {
          glob: { type: "string" },
          path: { type: "string" },
          exclude: { type: "array", items: { type: "string" } },
        },
        required: ["glob"],
      });
      expect(tool?.outputSchema).toMatchObject({
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" } },
          truncated: { type: "boolean" },
        },
        required: ["files", "truncated"],
      });
    });
  });

  describe("with several roots", () => {
    let first: Fixture;
    let second: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      first = createFixture("multi-a", { "a.md": "a\n" });
      second = createFixture("multi-b", { "b.md": "b\n", "sub/c.md": "c\n" });
      mcp = await connect([first.root, second.root]);
    });

    afterEach(async () => {
      await mcp.close();
      first.cleanup();
      second.cleanup();
    });

    it("requires an explicit path", async () => {
      const result = await mcp.callError("list_matching_files", { glob: "*.md" });
      expect(textOf(result)).toMatch(/path is required/);
      expect(result.structuredContent).toBeUndefined();
    });

    it("lists only inside the chosen root, relative to that root", async () => {
      const inSecond = await mcp.callOk("list_matching_files", {
        glob: "*.md",
        path: second.root,
      });
      expect(sorted(inSecond.files)).toEqual(["b.md", join("sub", "c.md")]);

      const inFirst = await mcp.callOk("list_matching_files", { glob: "*.md", path: first.root });
      expect(inFirst.files).toEqual(["a.md"]);
    });
  });

  describe("at the file cap", () => {
    let fixture: Fixture;
    let mcp: Harness;

    beforeEach(async () => {
      const files = Object.fromEntries(
        Array.from({ length: 501 }, (_, index) => [`f${String(index).padStart(3, "0")}.md`, "x\n"]),
      );
      fixture = createFixture("cap", files);
      mcp = await connect([fixture.root]);
    });

    afterEach(async () => {
      await mcp.close();
      fixture.cleanup();
    });

    it("returns at most 500 files and flags truncation", async () => {
      const result = await mcp.callOk("list_matching_files", { glob: "*.md" });
      expect(result.files).toHaveLength(500);
      expect(result.truncated).toBe(true);
      for (const file of result.files as string[]) expect(file).toMatch(/^f\d{3}\.md$/);
    });
  });
});
