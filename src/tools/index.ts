import type { McpServer } from "@modelcontextprotocol/server";
import { registerCountMatches } from "./count-matches.js";
import { registerGetDatetime } from "./get-datetime.js";
import { registerListAllowedDirs } from "./list-allowed-dirs.js";
import { registerListMatchingFiles } from "./list-matching-files.js";
import { registerSearchContent } from "./search-content.js";

export function registerTools(server: McpServer, roots: readonly string[]): void {
  registerGetDatetime(server);
  registerListAllowedDirs(server, roots);
  registerListMatchingFiles(server, roots);
  registerCountMatches(server, roots);
  registerSearchContent(server, roots);
}
