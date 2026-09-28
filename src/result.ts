import type { CallToolResult } from "@modelcontextprotocol/server";

export const DEFAULT_MAX_CHARS = 20_000;

export function truncate(text: string, maxChars = DEFAULT_MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`;
}

export function jsonResult(obj: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(obj) }],
    structuredContent: obj,
  };
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
