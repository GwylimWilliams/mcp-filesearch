import { expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.js";

/**
 * 23:30Z on a Monday: late enough that +09:00, +05:45 and +01:00 all roll
 * over to the next day, and close enough to midnight to catch off-by-one
 * errors in the offset maths.
 */
export const FIXED_NOW_ISO = "2026-09-28T23:30:00.000Z";
export const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);
export const FIXED_NOW_UNIX = 1_790_638_200;

/** Freezes `Date` only; timers stay real so the SDK's I/O is unaffected. */
export function useFrozenClock(at: number = FIXED_NOW_MS): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}

export function useRealClock(): void {
  vi.useRealTimers();
}

export interface Harness {
  client: Client;
  /** Calls a tool, asserting it succeeded, and returns its structured output. */
  callOk(name: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Calls a tool, asserting it failed, and returns the raw error result. */
  callError(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

export function textOf(result: CallToolResult): string {
  return result.content.map((block) => (block.type === "text" ? block.text : "")).join("\n");
}

export async function connect(): Promise<Harness> {
  const server = createServer();
  const client = new Client({ name: "test-harness", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  // Populates the listing cache that callTool() validates structured output against.
  await client.listTools();

  return {
    client,

    async callOk(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, `expected ${name}(${JSON.stringify(args)}) to succeed: ${textOf(result)}`).toBeFalsy();
      expect(result.structuredContent).toBeDefined();
      return result.structuredContent as Record<string, unknown>;
    },

    async callError(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, `expected ${name}(${JSON.stringify(args)}) to fail`).toBe(true);
      return result;
    },

    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
