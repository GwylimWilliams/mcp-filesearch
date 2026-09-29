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

// rg's --max-columns leaves --json line text untouched, so the real cap is here.
const MAX_LINE_CHARS = 500;

const inputSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .max(1000)
    .describe("Regular expression to search for, or a literal string when fixedStrings is true."),
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
      'Only search files matching this glob, e.g. "*.md". A pattern without a slash matches the file name.',
    ),
  fixedStrings: z
    .boolean()
    .default(false)
    .describe("Treat pattern as a literal string rather than a regular expression."),
  caseSensitive: z
    .boolean()
    .default(false)
    .describe("Match case-sensitively; by default matching is case-insensitive."),
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(0)
    .describe("Lines of context to return around each match (0-10); 0 returns the matching line only."),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe("Maximum number of matching lines to return (1-500)."),
});

const outputSchema = z.object({
  matches: z
    .array(
      z.object({
        file: z.string().describe("File containing the match, as a path relative to its allowed root."),
        line: z.number().describe("1-based line number of the matching line."),
        column: z.number().describe("1-based column of the first match on the line."),
        text: z
          .string()
          .describe(`The matching line without its line ending, capped at ${MAX_LINE_CHARS} characters.`),
        context: z
          .array(z.object({ line: z.number(), text: z.string() }))
          .optional()
          .describe("Lines surrounding the match, in file order, when contextLines is greater than 0."),
      }),
    )
    .describe("Matching lines, capped at maxResults entries."),
  count: z.number().describe("Total matching lines found, including any beyond the returned cap."),
  truncated: z.boolean().describe("True when matches were left out, or a returned line was cut short."),
});

// Keeping the child's working directory at the searched path makes slash-containing globs
// relative to it, and keeps cwd inside an allowed root.
function searchCwd(resolvedPath: string): string {
  return statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath);
}

interface ArbitraryData {
  text?: unknown;
  bytes?: unknown;
}

interface RgEvent {
  type?: unknown;
  data?: {
    path?: ArbitraryData | null;
    lines?: ArbitraryData | null;
    line_number?: unknown;
    submatches?: unknown;
  } | null;
}

interface LineEntry {
  kind: "match" | "context";
  line: number;
  bytes: Buffer;
  matchStart: number;
}

interface MatchOutput {
  file: string;
  line: number;
  column: number;
  text: string;
  context?: { line: number; text: string }[];
}

// C0 control characters except tab; file content is untrusted input.
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F]/g;

// rg's JSON encodes arbitrary data as `text` when it is valid UTF-8, `bytes` (base64) otherwise.
function decodeData(data: ArbitraryData | null | undefined): Buffer | null {
  if (data === null || data === undefined) return null;
  if (typeof data.text === "string") return Buffer.from(data.text, "utf8");
  if (typeof data.bytes === "string") return Buffer.from(data.bytes, "base64");
  return null;
}

function renderLine(bytes: Buffer): { text: string; capped: boolean } {
  const text = bytes
    .toString("utf8")
    .replace(/\r?\n$/, "")
    .replace(CONTROL_CHARS, "");
  if (text.length <= MAX_LINE_CHARS) return { text, capped: false };
  return { text: `${text.slice(0, MAX_LINE_CHARS)}…`, capped: true };
}

// Submatch offsets are byte offsets into the line; the column counts code points
// of the rendered text, so it indexes into the text this tool returns.
function columnAt(bytes: Buffer, byteOffset: number): number {
  const prefix = bytes.subarray(0, byteOffset).toString("utf8").replace(CONTROL_CHARS, "");
  return Array.from(prefix).length + 1;
}

function firstSubmatchStart(submatches: unknown): number {
  if (!Array.isArray(submatches)) return 0;
  const first: unknown = submatches[0];
  if (typeof first !== "object" || first === null) return 0;
  const { start } = first as { start?: unknown };
  return typeof start === "number" && start >= 0 ? start : 0;
}

function contextAround(
  entries: readonly LineEntry[],
  index: number,
  contextLines: number,
): { lines: { line: number; text: string }[]; capped: boolean } {
  const matchLine = entries[index].line;
  const lines: { line: number; text: string }[] = [];
  let capped = false;

  for (let i = index - 1; i >= 0 && entries[i].kind === "context"; i--) {
    if (entries[i].line < matchLine - contextLines) break;
    const rendered = renderLine(entries[i].bytes);
    capped = capped || rendered.capped;
    lines.unshift({ line: entries[i].line, text: rendered.text });
  }
  for (let i = index + 1; i < entries.length && entries[i].kind === "context"; i++) {
    if (entries[i].line > matchLine + contextLines) break;
    const rendered = renderLine(entries[i].bytes);
    capped = capped || rendered.capped;
    lines.push({ line: entries[i].line, text: rendered.text });
  }

  return { lines, capped };
}

function collectMatches(
  stdout: string,
  roots: readonly string[],
  maxResults: number,
  contextLines: number,
): { matches: MatchOutput[]; count: number; truncated: boolean } {
  const matches: MatchOutput[] = [];
  let count = 0;
  let capped = false;

  let file: string | null = null;
  let entries: LineEntry[] = [];

  const flush = (): void => {
    if (file !== null) {
      for (const [index, entry] of entries.entries()) {
        if (entry.kind !== "match") continue;
        count++;
        if (matches.length >= maxResults) continue;

        const rendered = renderLine(entry.bytes);
        capped = capped || rendered.capped;

        const match: MatchOutput = {
          file: relativeToRoot(file, roots),
          line: entry.line,
          column: columnAt(entry.bytes, entry.matchStart),
          text: rendered.text,
        };
        if (contextLines > 0) {
          const context = contextAround(entries, index, contextLines);
          capped = capped || context.capped;
          match.context = context.lines;
        }
        matches.push(match);
      }
    }
    file = null;
    entries = [];
  };

  for (const raw of stdout.split("\n")) {
    if (raw.length === 0) continue;

    let event: RgEvent;
    try {
      event = JSON.parse(raw) as RgEvent;
    } catch {
      continue;
    }
    const data = event.data ?? null;

    if (event.type === "begin") {
      flush();
      file = decodeData(data?.path)?.toString("utf8") ?? null;
      continue;
    }
    if (event.type === "end") {
      flush();
      continue;
    }
    if (event.type !== "match" && event.type !== "context") continue;

    if (file === null) file = decodeData(data?.path)?.toString("utf8") ?? null;
    const bytes = decodeData(data?.lines);
    const line = data?.line_number;
    if (file === null || bytes === null || typeof line !== "number") continue;

    entries.push({
      kind: event.type,
      line,
      bytes,
      matchStart: event.type === "match" ? firstSubmatchStart(data?.submatches) : 0,
    });
  }
  flush();

  return { matches, count, truncated: capped || count > maxResults };
}

export function registerSearchContent(server: McpServer, roots: readonly string[]): void {
  server.registerTool(
    "search_content",
    {
      title: "Search content",
      description:
        "Search file contents for a pattern under an allowed root, one entry per matching line, " +
        "with its file, line number, column and text. Paths come back relative to their root. " +
        ".git and .chrome-data are never searched.",
      inputSchema,
      outputSchema,
      annotations: READ_ONLY,
    },
    async ({ pattern, path, glob, fixedStrings, caseSensitive, contextLines, maxResults }) => {
      const target = path ?? (roots.length === 1 ? roots[0] : undefined);
      if (target === undefined) {
        return errorResult("path is required: more than one allowed root is configured.");
      }

      const resolved = resolveInRoots(target, roots);
      if ("error" in resolved) return errorResult(resolved.error);

      const argv = [
        "--json",
        "--no-ignore-vcs",
        "--max-columns",
        String(MAX_LINE_CHARS),
        "--max-filesize",
        "2M",
        ...(fixedStrings ? ["-F"] : []),
        ...(caseSensitive ? ["-s"] : ["-i"]),
        ...(contextLines > 0 ? ["-C", String(contextLines)] : []),
        ...(glob ? ["-g", glob] : []),
        ...ALWAYS_EXCLUDED_GLOBS.flatMap((excluded) => ["-g", `!${excluded}`]),
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

      const { matches, count, truncated } = collectMatches(stdout, roots, maxResults, contextLines);
      return jsonResult({ matches, count, truncated });
    },
  );
}
