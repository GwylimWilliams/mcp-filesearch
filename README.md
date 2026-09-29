# mcp-filesearch

A read-only, root-scoped filesystem search MCP server. It wraps ripgrep (`rg`) behind a small set of bounded tools — file listing, match counting, content search — always confined to the roots passed on the command line: never a shell, never a write.

**Status: under construction, phase by phase.** [`docs/implementation-plan.md`](docs/implementation-plan.md) is the canonical plan and records what has landed. Today the server ships `get_datetime` as its liveness probe; the search tools arrive phase by phase behind the security rules in [`CONVENTIONS.md`](CONVENTIONS.md).

## Requirements

Node ≥ 22; CI runs 22 and 24, and `.node-version` pins 24 for local mise users. The search tools spawn `rg`, which CI runners ship.

## Develop

```
npm ci
npm run build
npm test
```

`npm test` runs vitest against `src/` through the SDK's own client over an in-memory transport, so no build is needed to test. `npm run build` is needed for the `bin` entry and for `npx` over GitHub.

## Run

```
node dist/index.js /path/to/search [another/root ...]
```

At least one allowed root is required — there is no default and no `cwd` fallback. Roots are `realpath`ed at startup and duplicates collapse; every path a tool touches is validated against them before anything runs.

## Register with 1MCP

```json
"filesearch": {
  "command": "npx",
  "args": ["-y", "github:GwylimWilliams/mcp-filesearch", "/path/to/search"],
  "tags": ["notes", "search"]
}
```

Scoped roots are passed as **CLI args after the repo** — never `cwd`, so the scoping holds whatever directory the gateway happens to run in. The `prepare` script builds on install, which is what makes `npx -y github:…` work without a published package.

## The rules

- [`CONVENTIONS.md`](CONVENTIONS.md) — the canonical rule list
- [`AGENTS.md`](AGENTS.md) — the same rules agent-facing, plus the per-tool checklist
- [`docs/adding-a-tool.md`](docs/adding-a-tool.md) — the worked walkthrough
- [`SECURITY.md`](SECURITY.md) — the security posture and how to report a problem

## License

MIT.
