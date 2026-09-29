import type { McpServer } from "@modelcontextprotocol/server";
import { registerGetDatetime } from "./get-datetime.js";

export function registerTools(server: McpServer, roots: readonly string[]): void {
  registerGetDatetime(server);
}
