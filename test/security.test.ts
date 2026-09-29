import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBin } from "../src/rg.js";
import { createFixture, type Fixture } from "./fixtures.js";
import { connect, textOf, type Harness } from "./harness.js";

// The subprocess seam with one switch: setting `injectedFailure.error` makes
// runRg reject, so the tool-level handling of a subprocess failure can be
// asserted without waiting out the real 10-second timeout. Unset, every call
// goes to the real rg.
const injectedFailure = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock("../src/rg.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/rg.js")>();
  return {
    ...actual,
    runRg: (...args: Parameters<typeof actual.runRg>): ReturnType<typeof actual.runRg> =>
      injectedFailure.error ? Promise.reject(injectedFailure.error) : actual.runRg(...args),
  };
});

interface MatchEntry {
  file: string;
  line: number;
  column: number;
  text: string;
}

function matchesOf(result: Record<string, unknown>): MatchEntry[] {
  return result.matches as MatchEntry[];
}

describe("security conventions", () => {
  let fixture: Fixture;
  let vault: Fixture;
  let mcp: Harness;

  beforeEach(async () => {
    // A directory outside every allowed root, with a secret to escape for.
    vault = createFixture("security-vault", { "secret.md": "needle in the vault\n" });
    fixture = createFixture("security", {
      "notes.md": "alpha needle target\n",
      "one.md": "alpha alpha\n",
      "two.md": "beta\n",
      "%2e%2e": "encoded needle\n",
      "-e": "dash-e needle\n",
      "--files": "dash-files needle\n",
      "evil.txt": `${"a".repeat(5000)}b\n`,
      "long.md": `needle${"x".repeat(5000)}\n`,
      "many.md": `${Array.from({ length: 5000 }, () => "hit").join("\n")}\n`,
      "binary.dat": Buffer.from("\x00\x00needle\x00\x07\n", "latin1"),
      "invalid.txt": Buffer.from("caf\xe9 needle here\n", "latin1"),
      ".git/secret.md": "needle in git\n",
      ".chrome-data/cache.md": "needle in cache\n",
    });
    symlinkSync(join(vault.root, "secret.md"), join(fixture.root, "escape.md"));
    symlinkSync(vault.root, join(fixture.root, "escape-dir"));
    symlinkSync(join(fixture.root, "one.md"), join(fixture.root, "alias.md"));

    mcp = await connect([fixture.root]);
  });

  afterEach(async () => {
    injectedFailure.error = null;
    await mcp.close();
    fixture.cleanup();
    vault.cleanup();
  });

  describe("path traversal", () => {
    it.each([
      { name: "list_matching_files", args: { glob: "*.md", path: "../../etc/passwd" } },
      { name: "count_matches", args: { pattern: "needle", path: "../../etc/passwd" } },
      { name: "search_content", args: { pattern: "needle", path: "../../etc/passwd" } },
    ])("rejects ../../etc/passwd on $name before any subprocess runs", async ({ name, args }) => {
      const result = await mcp.callError(name, args);
      expect(textOf(result)).toMatch(/cannot be resolved|outside the allowed roots/);
      expect(textOf(result)).not.toContain("exited with code");
    });

    it.each([
      { name: "list_matching_files", args: { glob: "*.md", path: "/etc" } },
      { name: "count_matches", args: { pattern: "needle", path: "/etc" } },
      { name: "search_content", args: { pattern: "needle", path: "/etc" } },
    ])("rejects the absolute path /etc on $name, outside every root", async ({ name, args }) => {
      const result = await mcp.callError(name, args);
      expect(textOf(result)).toContain("outside the allowed roots");
      expect(textOf(result)).not.toContain("exited with code");
    });

    it("rejects an outside path before the subprocess seam is even reached", async () => {
      // With the seam primed to fail, the error still names the path: path
      // validation runs first, so no subprocess could have been started.
      injectedFailure.error = new Error("the subprocess ran");
      const result = await mcp.callError("search_content", { pattern: "needle", path: "/etc" });
      expect(textOf(result)).toContain("outside the allowed roots");
      expect(textOf(result)).not.toContain("the subprocess ran");
    });

    it("treats %2e%2e as a literal filename, never as traversal", async () => {
      const bare = await mcp.callError("search_content", { pattern: "needle", path: "%2e%2e" });
      expect(textOf(bare)).toContain("cannot be resolved");
      expect(textOf(bare)).not.toContain("outside the allowed roots");

      const literal = await mcp.callOk("search_content", {
        pattern: "encoded",
        path: join(fixture.root, "%2e%2e"),
      });
      expect(matchesOf(literal)).toEqual([
        { file: "%2e%2e", line: 1, column: 1, text: "encoded needle" },
      ]);
    });

    it("rejects a symlink inside the root that points outside it", async () => {
      for (const path of [
        join(fixture.root, "escape.md"),
        join(fixture.root, "escape-dir"),
        join(fixture.root, "escape-dir", "secret.md"),
      ]) {
        const result = await mcp.callError("search_content", { pattern: "needle", path });
        expect(textOf(result), path).toContain("outside the allowed roots");
        expect(textOf(result), path).not.toContain("exited with code");
      }
    });

    it("accepts a symlink that resolves inside the root", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "alpha",
        path: join(fixture.root, "alias.md"),
      });
      // Containment is judged on the resolved path, so the match is reported
      // against the link's target, which is what was actually searched.
      expect(matchesOf(result)).toEqual([
        { file: "one.md", line: 1, column: 1, text: "alpha alpha" },
      ]);
    });
  });

  describe("option smuggling", () => {
    it("treats a --pre pattern as a literal string and executes nothing", async () => {
      const canary = join(fixture.root, "pwned");
      const touch = await mcp.callOk("search_content", { pattern: `--pre=touch ${canary}` });
      expect(touch).toEqual({ matches: [], count: 0, truncated: false });
      expect(existsSync(canary)).toBe(false);

      const shell = await mcp.callOk("search_content", { pattern: "--pre=/bin/sh" });
      expect(shell).toEqual({ matches: [], count: 0, truncated: false });

      const counted = await mcp.callOk("count_matches", { pattern: "--pre=/bin/sh" });
      expect(counted).toEqual({ counts: [], total: 0, truncated: false });
    });

    it("treats a --files pattern as a literal string", async () => {
      expect(await mcp.callOk("search_content", { pattern: "--files" })).toEqual({
        matches: [],
        count: 0,
        truncated: false,
      });
      expect(await mcp.callOk("count_matches", { pattern: "--files" })).toEqual({
        counts: [],
        total: 0,
        truncated: false,
      });
    });

    it("rejects a path that looks like a flag before any subprocess runs", async () => {
      const result = await mcp.callError("search_content", { pattern: "needle", path: "-e" });
      expect(textOf(result)).toMatch(/cannot be resolved|outside the allowed roots/);
      expect(textOf(result)).not.toContain("exited with code");

      // The literal file of that name, inside the root, is still searchable.
      const literal = await mcp.callOk("search_content", {
        pattern: "needle",
        path: join(fixture.root, "-e"),
      });
      expect(matchesOf(literal)).toEqual([
        { file: "-e", line: 1, column: 8, text: "dash-e needle" },
      ]);
    });

    it("treats a glob that begins with a dash as a literal glob", async () => {
      expect(await mcp.callOk("list_matching_files", { glob: "-e" })).toEqual({
        files: ["-e"],
        truncated: false,
      });
      expect(await mcp.callOk("list_matching_files", { glob: "--files" })).toEqual({
        files: ["--files"],
        truncated: false,
      });
    });

    it("exposes no free-form flags field on any tool", async () => {
      const banned = ["args", "flags", "options", "extraArgs", "extra_args", "rgArgs"];
      const { tools } = await mcp.client.listTools();
      for (const tool of tools) {
        const properties = (tool.inputSchema as { properties?: Record<string, unknown> })
          .properties;
        for (const name of banned) {
          expect(Object.keys(properties ?? {}), `${tool.name} exposes ${name}`).not.toContain(
            name,
          );
        }
      }
    });
  });

  describe("bounded execution", () => {
    it("completes a catastrophic regex quickly", async () => {
      const started = Date.now();
      const result = await mcp.callOk("search_content", { pattern: "(a+)+$", glob: "evil.txt" });
      expect(Date.now() - started).toBeLessThan(1000);
      expect(result).toEqual({ matches: [], count: 0, truncated: false });
    });

    it("caps a huge result set and flags truncation", async () => {
      const result = await mcp.callOk("search_content", { pattern: "hit" });
      expect(matchesOf(result)).toHaveLength(100);
      expect(matchesOf(result)[0]).toEqual({ file: "many.md", line: 1, column: 1, text: "hit" });
      expect(matchesOf(result)[99].line).toBe(100);
      expect(result.count).toBe(5000);
      expect(result.truncated).toBe(true);
      expect(JSON.stringify(result).length).toBeLessThan(20_000);
    });
  });

  describe("untrusted file content", () => {
    it("strips control characters from a binary file's text", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "needle",
        path: join(fixture.root, "binary.dat"),
      });
      expect(matchesOf(result)).toEqual([
        { file: "binary.dat", line: 1, column: 1, text: "needle" },
      ]);
      expect(matchesOf(result)[0].text).not.toMatch(/[\u0000-\u0008\u000B-\u001F]/);
    });

    it("returns replacement characters for invalid UTF-8 without crashing", async () => {
      const result = await mcp.callOk("search_content", {
        pattern: "needle",
        path: join(fixture.root, "invalid.txt"),
      });
      expect(matchesOf(result)).toEqual([
        { file: "invalid.txt", line: 1, column: 6, text: "caf\uFFFD needle here" },
      ]);
    });

    it("caps a very long line and flags truncation", async () => {
      const result = await mcp.callOk("search_content", { pattern: "needle", glob: "long.md" });
      const [match] = matchesOf(result);
      expect(result.truncated).toBe(true);
      expect(match.text.startsWith("needle")).toBe(true);
      expect(match.text.endsWith("…")).toBe(true);
      expect(match.text).toHaveLength(501);
    });
  });

  describe("subprocess failures", () => {
    it("kills a child that runs past its timeout and rejects cleanly (seam level)", async () => {
      const scratch = mkdtempSync(join(tmpdir(), "mcp-filesearch-security-"));
      try {
        const pidFile = join(scratch, "pid");
        const script =
          `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));` +
          "setInterval(() => {}, 1000);";

        const started = Date.now();
        await expect(
          runBin(process.execPath, ["-e", script], {
            cwd: scratch,
            timeoutMs: 500,
            okCodes: [0, 1],
          }),
        ).rejects.toThrow(/timed out/);
        expect(Date.now() - started).toBeLessThan(5_000);

        const pid = Number(readFileSync(pidFile, "utf8"));
        expect(() => process.kill(pid, 0)).toThrow();
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });

    it("surfaces a subprocess timeout as one clean tool error (tool level)", async () => {
      injectedFailure.error = new Error("rg timed out after 10000ms and was killed");
      const result = await mcp.callError("search_content", { pattern: "needle" });
      const message = textOf(result);
      expect(message).toContain("timed out");
      expect(message).not.toMatch(/\n/);
      expect(result.structuredContent).toBeUndefined();
    });
  });

  describe("concurrent calls", () => {
    it("keeps concurrent calls independent: each result matches its own arguments", async () => {
      const [alpha, beta, counted, listed, dirs, capped1, capped2, capped3] = await Promise.all([
        mcp.callOk("search_content", { pattern: "alpha", glob: "one.md" }),
        mcp.callOk("search_content", { pattern: "beta", glob: "two.md" }),
        mcp.callOk("count_matches", { pattern: "beta" }),
        mcp.callOk("list_matching_files", { glob: "t*.md" }),
        mcp.callOk("list_allowed_dirs"),
        mcp.callOk("search_content", { pattern: "hit", maxResults: 1 }),
        mcp.callOk("search_content", { pattern: "hit", maxResults: 2 }),
        mcp.callOk("search_content", { pattern: "hit", maxResults: 3 }),
      ]);

      expect(alpha).toEqual({
        matches: [{ file: "one.md", line: 1, column: 1, text: "alpha alpha" }],
        count: 1,
        truncated: false,
      });
      expect(beta).toEqual({
        matches: [{ file: "two.md", line: 1, column: 1, text: "beta" }],
        count: 1,
        truncated: false,
      });
      expect(counted).toEqual({ counts: [{ file: "two.md", count: 1 }], total: 1, truncated: false });
      expect(listed).toEqual({ files: ["two.md"], truncated: false });
      expect(dirs).toEqual({ directories: [fixture.root] });

      for (const [result, limit] of [
        [capped1, 1],
        [capped2, 2],
        [capped3, 3],
      ] as const) {
        expect(matchesOf(result)).toHaveLength(limit);
        expect(result.count).toBe(5000);
        expect(result.truncated).toBe(true);
      }
    });
  });

  describe("allowed roots", () => {
    it("never widens beyond the CLI arguments", async () => {
      const scoped = await connect([fixture.root, vault.root]);
      try {
        expect(await scoped.callOk("list_allowed_dirs")).toEqual({
          directories: [fixture.root, vault.root],
        });

        // The parent of a root is itself outside every root.
        const sneaky = await scoped.callError("search_content", {
          pattern: "needle",
          path: join(fixture.root, ".."),
        });
        expect(textOf(sneaky)).toContain("outside the allowed roots");
        expect(textOf(sneaky)).not.toContain("exited with code");
      } finally {
        await scoped.close();
      }
    });
  });
});
