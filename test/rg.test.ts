import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBin } from "../src/rg.js";

const node = process.execPath;
const cwd = process.cwd();

function runNode(script: string, timeoutMs = 5_000) {
  return runBin(node, ["-e", script], { cwd, timeoutMs, okCodes: [0, 1] });
}

describe("runBin", () => {
  it("resolves on exit 0 and collects stdout and stderr", async () => {
    const result = await runNode(
      'process.stdout.write("out"); process.stderr.write("err"); process.exit(0)',
    );
    expect(result).toEqual({ code: 0, stdout: "out", stderr: "err" });
  });

  it("resolves on exit 1: no matches is not an error", async () => {
    await expect(runNode("process.exit(1)")).resolves.toEqual({ code: 1, stdout: "", stderr: "" });
  });

  it("rejects on exit codes outside okCodes", async () => {
    await expect(runNode("process.exit(2)")).rejects.toThrow(/exited with code 2/);
  });

  it("rejects cleanly when the binary cannot be spawned", async () => {
    const error = await runBin("no-such-bin-xyz", [], { cwd, timeoutMs: 5_000, okCodes: [0, 1] }).then(
      () => null,
      (reason: Error) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain("no-such-bin-xyz");
    expect(error?.message.split("\n")).toHaveLength(1);
  });

  it("kills the child and rejects on timeout", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "mcp-filesearch-rg-"));
    try {
      const pidFile = join(scratch, "pid");
      const script =
        `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));` +
        "setInterval(() => {}, 1000);";

      const started = Date.now();
      await expect(runNode(script, 500)).rejects.toThrow(/timed out/);
      expect(Date.now() - started).toBeLessThan(5_000);

      const pid = Number(readFileSync(pidFile, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
