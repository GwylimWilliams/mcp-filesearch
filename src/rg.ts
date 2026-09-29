import { spawn } from "node:child_process";

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  okCodes: readonly number[];
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function logStderr(stderr: string): void {
  if (stderr.length > 0) process.stderr.write(stderr);
}

export function runBin(bin: string, argv: readonly string[], options: RunOptions): Promise<RunResult> {
  const { cwd, timeoutMs, okCodes } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, argv, { shell: false, cwd, timeout: timeoutMs, killSignal: "SIGKILL" });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(new Error(`failed to run ${bin}: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (code === null && signal === "SIGKILL") {
        logStderr(stderr);
        reject(new Error(`${bin} timed out after ${timeoutMs}ms and was killed`));
        return;
      }
      if (code === null) {
        logStderr(stderr);
        reject(new Error(`${bin} was terminated by signal ${signal ?? "unknown"}`));
        return;
      }
      if (!okCodes.includes(code)) {
        logStderr(stderr);
        reject(new Error(`${bin} exited with code ${code}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

export function runRg(argv: readonly string[], cwd: string, timeoutMs = 10_000): Promise<RunResult> {
  return runBin("rg", argv, { cwd, timeoutMs, okCodes: [0, 1] });
}
