import type { McpServer } from "@modelcontextprotocol/server";
import { registerGetDatetime } from "./get-datetime.js";
import { registerListAllowedDirs } from "./list-allowed-dirs.js";

export function registerTools(server: McpServer, roots: readonly string[]): void {
  registerGetDatetime(server);
  registerListAllowedDirs(server, roots);
}
