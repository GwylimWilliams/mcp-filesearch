#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { parseRoots } from "./roots.js";

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write("usage: mcp-filesearch <allowed-root> [allowed-root ...]\n");
    process.exitCode = 1;
    return;
  }

  const parsed = parseRoots(args);
  if ("error" in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    process.exitCode = 1;
    return;
  }

  serveStdio(() => createServer(parsed.roots));
}

main();
