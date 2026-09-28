# mcp-base

The template every MCP server here is instantiated from: a stdio server with one `registerTools` seam, structured output, and annotation presets so a tool cannot be written without carrying its safety hints.

It is also the cheap place to retire SDK unknowns. The `get_datetime` example exists to exercise the SDK v2 surface end to end — handshake, annotations, structured output, schema rejection — so the servers that matter don't discover those on their own.

## Status

| Tag | What it is |
| --- | --- |
| `v0.1.0` (current) | Proving ground — scaffold, example tool, tool-level tests |
| `v0.2.0` | The backport — single subprocess seam, root/path validation, security test suite |

Still to land before `v0.1.0` is tagged: the 1MCP wiring proof, `scripts/instantiate.ts`, the SDK-drift test and dependabot. The design notes live in Trilium.

## Requirements

Node ≥ 22. CI runs 22 and 24; `.node-version` pins 24 for local mise users.

## Develop

```
npm ci
npm run build
npm test
```

`npm test` runs vitest against `src/` through the SDK's own client over an in-memory transport, so no build and no spawned process are involved. `npm run build` is only needed for the `bin` entry and for `npx` over GitHub.

## Instantiate

1. **Use this template** on GitHub — a fork would share history, which is not what you want.
2. Run the instantiation script. It substitutes `__name__` and reports every replacement point it could not infer; the substitution contract lives in `src/placeholders.ts`. Until the script lands, substitute those points by hand.
3. Delete the example: `src/tools/get-datetime.ts`, its line in `src/tools/index.ts`, and its tests in `test/`.

Then add the first real tool — see [AGENTS.md](AGENTS.md) for the checklist.

## Register with 1MCP

```json
"mcpbase": {
  "command": "npx",
  "args": ["-y", "github:GwylimWilliams/mcp-base"],
  "tags": ["test"]
}
```

The `prepare` script builds on install, which is what makes `npx -y github:…` work without a published package.

When a server takes scoped roots, they are passed as **CLI args after the repo** — never `cwd`, so the scoping holds whatever directory the gateway happens to run in.

## The rules

- [`CONVENTIONS.md`](CONVENTIONS.md) — the canonical rule list
- [`AGENTS.md`](AGENTS.md) — the same rules agent-facing, plus the per-tool checklist
- [`docs/adding-a-tool.md`](docs/adding-a-tool.md) — the worked walkthrough
- [`SECURITY.md`](SECURITY.md) — the security posture and how to report a problem

## License

MIT.
