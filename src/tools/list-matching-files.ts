import { statSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { READ_ONLY } from "../annotations.js";
import { errorResult, jsonResult } from "../result.js";
import { runRg } from "../rg.js";
import { relativeToRoot, resolveInRoots } from "../roots.js";

// `--files` lists what a search would visit; VCS ignores off so ignored files still appear.
const FILE_LISTING_ARGS = ["--files", "--no-ignore-vcs"] as const;

// Appended to every call: these are never listed, whatever the caller asks for.
const ALWAYS_EXCLUDED_GLOBS = ["**/.git/**", "**/.chrome-data/**"] as const;

const MAX_FILES = 500;

const inputSchema = z.object({
  glob: z
    .string()
    .min(1)
    .max(500)
    .describe('Glob the file paths must match, e.g. "*.md". A pattern without a slash matches the file name.'),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Directory or file to list, inside an allowed root. Defaults to the allowed root when exactly one is configured.",
    ),
  exclude: z
    .array(z.string().min(1).max(500))
    .max(100)
    .optional()
    .describe('Glob patterns to exclude, e.g. ["*.txt", "vendor/**"].'),
});

const outputSchema = z.object({
  files: z.array(z.string()).describe("Matching files, as paths relative to their allowed root."),
  truncated: z
    .boolean()
    .describe(
      `True when more than ${MAX_FILES} files matched; only the first ${MAX_FILES} are returned.`,
    ),
});

// Keeping the child's working directory at the searched path makes slash-containing globs
// relative to it, and keeps cwd inside an allowed root.
function searchCwd(resolvedPath: string): string {
  return statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath);
}

export function registerListMatchingFiles(server: McpServer, roots: readonly string[]): void {
  server.registerTool(
    "list_matching_files",
    {
      title: "List matching files",
      description:
        "List the files a search would visit: those whose paths match a glob, under an allowed root. " +
        "Patterns are matched relative to the directory searched; paths come back relative to their root. " +
        ".git and .chrome-data are never listed.",
      inputSchema,
      outputSchema,
      annotations: READ_ONLY,
    },
    async ({ glob, path, exclude }) => {
      const target = path ?? (roots.length === 1 ? roots[0] : undefined);
      if (target === undefined) {
        return errorResult("path is required: more than one allowed root is configured.");
      }

      const resolved = resolveInRoots(target, roots);
      if ("error" in resolved) return errorResult(resolved.error);

      const argv = [
        ...FILE_LISTING_ARGS,
        "-g",
        glob,
        ...ALWAYS_EXCLUDED_GLOBS.flatMap((pattern) => ["-g", `!${pattern}`]),
        ...(exclude ?? []).flatMap((pattern) => ["-g", `!${pattern}`]),
        "--",
        resolved.path,
      ];

      let stdout: string;
      try {
        ({ stdout } = await runRg(argv, searchCwd(resolved.path)));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }

      const listed = stdout.split("\n").filter((line) => line.length > 0);
      return jsonResult({
        files: listed.slice(0, MAX_FILES).map((absolutePath) => relativeToRoot(absolutePath, roots)),
        truncated: listed.length > MAX_FILES,
      });
    },
  );
}
