import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { READ_ONLY } from "../annotations.js";
import { errorResult, jsonResult } from "../result.js";

const MS_PER_DAY = 86_400_000;

// Pinned: host-independent output, 24-hour clock, ASCII digits for the ISO builder.
const LOCALE = "en-GB";

const inputSchema = z.object({
  timezone: z
    .string()
    .default("UTC")
    .describe('IANA timezone name, e.g. "UTC", "Europe/London", "Asia/Tokyo".'),
  offsetDays: z
    .number()
    .int()
    .min(-365)
    .max(365)
    .default(0)
    .describe("Whole days to shift the result, relative to now."),
  format: z
    .enum(["iso", "unix", "human"])
    .default("iso")
    .describe('Adds a localized "human" string when set to "human".'),
});

const outputSchema = z.object({
  iso: z
    .string()
    .describe("ISO 8601 wall-clock time in the requested zone, carrying that zone's UTC offset."),
  unix: z.number().describe("Seconds since the Unix epoch."),
  timezone: z.string().describe("Canonical IANA name of the resolved zone."),
  human: z
    .string()
    .optional()
    .describe('Localized rendering; present only when format is "human".'),
});

function resolveZone(timezone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat(LOCALE, { timeZone: timezone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function wallClockParts(date: Date, timeZone: string): Record<string, string> {
  const dtf = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(date)) parts[type] = value;
  return parts;
}

function isoInZone(date: Date, timeZone: string): string {
  const p = wallClockParts(date, timeZone);
  const wallAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  const offsetMinutes = Math.round(
    (wallAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000,
  );
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  const wall = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${millis}`;
  if (offsetMinutes === 0) return `${wall}Z`;
  const sign = offsetMinutes > 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${wall}${sign}${hh}:${mm}`;
}

function humanInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(date);
}

export function registerGetDatetime(server: McpServer): void {
  server.registerTool(
    "get_datetime",
    {
      title: "Get date and time",
      description:
        "Current date and time in an IANA timezone, optionally shifted by whole days. " +
        "The iso field is the wall clock in that zone, so its offset makes the instant unambiguous; " +
        "unix is the same instant as epoch seconds, and human is a localized rendering.",
      inputSchema,
      outputSchema,
      annotations: READ_ONLY,
    },
    async ({ timezone, offsetDays, format }) => {
      const timeZone = resolveZone(timezone);
      if (timeZone === undefined) {
        return errorResult(
          `Invalid IANA timezone: "${timezone}". ` +
            'Use a zone name such as "UTC", "Europe/London" or "Asia/Tokyo".',
        );
      }

      const instant = new Date(Date.now() + offsetDays * MS_PER_DAY);
      const result: { iso: string; unix: number; timezone: string; human?: string } = {
        iso: isoInZone(instant, timeZone),
        unix: Math.floor(instant.getTime() / 1000),
        timezone: timeZone,
      };
      if (format === "human") result.human = humanInZone(instant, timeZone);
      return jsonResult(result);
    },
  );
}
