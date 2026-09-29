import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { READ_ONLY } from "../annotations.js";
import { jsonResult } from "../result.js";

const inputSchema = z.object({});

const outputSchema = z.object({
  directories: z.array(z.string()).describe("Resolved allowed roots."),
});

export function registerListAllowedDirs(server: McpServer, roots: readonly string[]): void {
  server.registerTool(
    "list_allowed_dirs",
    {
      title: "List allowed directories",
      description: "List the directories this server is permitted to search.",
      inputSchema,
      outputSchema,
      annotations: READ_ONLY,
    },
    async () => jsonResult({ directories: [...roots] }),
  );
}
