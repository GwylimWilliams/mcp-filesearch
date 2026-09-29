import { McpServer } from "@modelcontextprotocol/server";
import { registerTools } from "./tools/index.js";

const SERVER_VERSION = "0.1.0"; // keep in sync with package.json

export function createServer(roots: readonly string[]): McpServer {
  const server = new McpServer({
    name: "mcp-filesearch",
    version: SERVER_VERSION,
  });
  registerTools(server, roots);
  return server;
}
