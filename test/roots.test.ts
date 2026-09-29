import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRoots, relativeToRoot, resolveInRoots } from "../src/roots.js";

let base: string;
let rootA: string;
let rootB: string;
let outsideFile: string;
let bFile: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "mcp-filesearch-roots-")));
  rootA = join(base, "a");
  rootB = join(base, "b");
  mkdirSync(join(rootA, "sub"), { recursive: true });
  mkdirSync(rootB, { recursive: true });
  writeFileSync(join(rootA, "sub", "file.md"), "# inside\n");
  bFile = join(rootB, "note.md");
  writeFileSync(bFile, "b\n");

  const outsideDir = join(base, "outside");
  mkdirSync(outsideDir, { recursive: true });
  outsideFile = join(outsideDir, "secret.md");
  writeFileSync(outsideFile, "outside\n");

  symlinkSync(outsideFile, join(rootA, "escape.md"));
  symlinkSync(outsideDir, join(rootA, "escape-dir"));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("parseRoots", () => {
  it("resolves existing directories", () => {
    expect(parseRoots([rootA])).toEqual({ roots: [rootA] });
  });

  it("collapses duplicates by resolved path", () => {
    expect(parseRoots([rootA, rootA + "/", rootB, rootA])).toEqual({ roots: [rootA, rootB] });
  });

  it("rejects an empty argument list", () => {
    expect(parseRoots([])).toEqual({ error: expect.stringMatching(/at least one/i) });
  });

  it("rejects a root that cannot be resolved, naming it", () => {
    const missing = join(base, "does-not-exist");
    expect(parseRoots([missing])).toEqual({ error: expect.stringContaining(missing) });
  });

  it("rejects a file as a root, naming it", () => {
    expect(parseRoots([outsideFile])).toEqual({ error: expect.stringContaining(outsideFile) });
  });
});

describe("resolveInRoots", () => {
  it("accepts a root itself", () => {
    expect(resolveInRoots(rootA, [rootA, rootB])).toEqual({ path: rootA });
  });

  it("accepts a path inside a root", () => {
    const file = join(rootA, "sub", "file.md");
    expect(resolveInRoots(file, [rootA])).toEqual({ path: file });
    expect(resolveInRoots(bFile, [rootA, rootB])).toEqual({ path: bFile });
  });

  it("rejects a relative traversal string", () => {
    expect(resolveInRoots("../../etc/passwd", [rootA])).toEqual({ error: expect.any(String) });
  });

  it("rejects .. traversal that lands outside every root", () => {
    const sneaky = join(rootA, "..", "outside", "secret.md");
    expect(resolveInRoots(sneaky, [rootA])).toEqual({ error: expect.any(String) });
  });

  it("rejects an absolute path outside every root", () => {
    expect(resolveInRoots(outsideFile, [rootA, rootB])).toEqual({ error: expect.any(String) });
  });

  it("rejects a symlink inside the root pointing outside it", () => {
    expect(resolveInRoots(join(rootA, "escape.md"), [rootA])).toEqual({ error: expect.any(String) });
    expect(resolveInRoots(join(rootA, "escape-dir", "secret.md"), [rootA])).toEqual({
      error: expect.any(String),
    });
  });

  it("rejects a non-existent path (fail closed)", () => {
    expect(resolveInRoots(join(rootA, "missing.md"), [rootA])).toEqual({ error: expect.any(String) });
  });

  it("treats percent-encoded traversal as a literal filename", () => {
    expect(resolveInRoots("%2e%2e", [rootA])).toEqual({ error: expect.any(String) });
  });
});

describe("relativeToRoot", () => {
  it("returns paths relative to their containing root", () => {
    expect(relativeToRoot(join(rootA, "sub", "file.md"), [rootA])).toBe(join("sub", "file.md"));
    expect(relativeToRoot(bFile, [rootA, rootB])).toBe("note.md");
  });

  it("returns an empty string for the root itself", () => {
    expect(relativeToRoot(rootA, [rootA])).toBe("");
  });

  it("returns the input unchanged when no root contains it", () => {
    expect(relativeToRoot(outsideFile, [rootA])).toBe(outsideFile);
  });
});
