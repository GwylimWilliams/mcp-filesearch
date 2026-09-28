import type { ToolAnnotations } from "@modelcontextprotocol/server";

export const READ_ONLY = {
  readOnlyHint: true,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

export const WRITE_IDEMPOTENT = {
  readOnlyHint: false,
  idempotentHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const satisfies ToolAnnotations;

export const WRITE_DESTRUCTIVE = {
  readOnlyHint: false,
  idempotentHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const satisfies ToolAnnotations;
