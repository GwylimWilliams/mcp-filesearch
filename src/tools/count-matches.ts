import { statSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { READ_ONLY } from "../annotations.js";
import { errorResult, jsonResult } from "../result.js";
import { runRg } from "../rg.js";
import { relativeToRoot, resolveInRoots } from "../roots.js";

// Appended to every call: these are never searched, whatever the caller asks for.
const ALWAYS_EXCLUDED_GLOBS = ["**/.git/**", "**/.chrome-data/**"] as const;

const MAX_FILES = 500;

const inputSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .max(1000)
    .describe("Regular expression to count, or a literal string when fixedStrings is true."),
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Directory or file to search, inside an allowed root. Defaults to the allowed root when exactly one is configured.",
    ),
  glob: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe(
      'Only count matches in files matching this glob, e.g. "*.md". A pattern without a slash matches the file name.',
    ),
  fixedStrings: z
    .boolean()
    .default(false)
    .describe("Treat pattern as a literal string rather than a regular expression."),
  caseSensitive: z
    .boolean()
    .default(false)
    .describe("Match case-sensitively; by default matching is case-insensitive."),
  countLines: z
    .boolean()
    .default(true)
    .describe("Count matching lines (the default) rather than individual matches."),
});

const outputSchema = z.object({
  counts: z
    .array(
      z.object({
        file: z.string().describe("Matching file, as a path relative to its allowed root."),
        count: z.number().describe("Matching lines, or matches when countLines is false."),
      }),
    )
    .describe(`One entry per matching file, capped at ${MAX_FILES}.`),
  total: z
    .number()
    .describe("Grand total across all matching files, including any beyond the returned cap."),
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

interface FileCount {
  file: string;
  count: number;
}

function parseCounts(stdout: string, roots: readonly string[]): FileCount[] {
  const counts: FileCount[] = [];
  for (const line of stdout.split("\n")) {
    if (line.length === 0) continue;
    // Paths may contain colons, so the count is whatever follows the last one.
    const separator = line.lastIndexOf(":");
    if (separator === -1) continue;
    const count = Number(line.slice(separator + 1));
    if (!Number.isInteger(count) || count < 0) continue;
    counts.push({ file: relativeToRoot(line.slice(0, separator), roots), count });
  }
  return counts;
}

export function registerCountMatches(server: McpServer, roots: readonly string[]): void {
  server.registerTool(
    "count_matches",
    {
      title: "Count matches",
      description:
        "Count matches of a pattern, one count per file, under an allowed root. " +
        "Counts matching lines by default; set countLines to false to count individual matches. " +
        ".git and .chrome-data are never searched.",
      inputSchema,
      outputSchema,
      annotations: READ_ONLY,
    },
    async ({ pattern, path, glob, fixedStrings, caseSensitive, countLines }) => {
      const target = path ?? (roots.length === 1 ? roots[0] : undefined);
      if (target === undefined) {
        return errorResult("path is required: more than one allowed root is configured.");
      }

      const resolved = resolveInRoots(target, roots);
      if ("error" in resolved) return errorResult(resolved.error);

      const argv = [
        countLines ? "-c" : "--count-matches",
        // Without this, a single-file search prints a bare count with no path to parse.
        "--with-filename",
        "--no-heading",
        "--no-ignore-vcs",
        ...(glob ? ["-g", glob] : []),
        ...ALWAYS_EXCLUDED_GLOBS.flatMap((excluded) => ["-g", `!${excluded}`]),
        ...(fixedStrings ? ["-F"] : []),
        ...(caseSensitive ? ["-s"] : ["-i"]),
        "-e",
        pattern,
        "--",
        resolved.path,
      ];

      let stdout: string;
      try {
        ({ stdout } = await runRg(argv, searchCwd(resolved.path)));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }

      const counts = parseCounts(stdout, roots);
      return jsonResult({
        counts: counts.slice(0, MAX_FILES),
        total: counts.reduce((sum, entry) => sum + entry.count, 0),
        truncated: counts.length > MAX_FILES,
      });
    },
  );
}
