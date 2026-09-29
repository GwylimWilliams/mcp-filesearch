# AGENTS.md

Rules for agents working in this repo — `mcp-filesearch`, a read-only, root-scoped filesystem search server — instantiated from the shared template, so a convention settled here is copied into sibling servers, and so is a shortcut.

`CONVENTIONS.md` is the canonical rule list; this file is its agent-facing restatement, plus the per-tool checklist and the SDK facts that must not be re-derived.

## Hard constraints

- **Read-only by default, annotations on every tool.** Never hand-write hints in a tool file — import a preset from `src/annotations.ts`.
- **Structured output only.** Every tool declares an `outputSchema` and returns `jsonResult(obj)` (`src/result.ts`). Never hand a client a raw string you didn't shape.
- **Fail as a tool error, never throw.** Return `errorResult(message)` with one clean sentence: no stack trace, no `RangeError`, no `\n    at `.
- **No shell, no raw-flag passthrough.** Every spawn goes through the single seam `src/rg.ts` — the only `child_process` importer — with `shell: false` and an argv array; no tool accepts a free-form flags/`args`/`options` field.
- **Locale is pinned, not inherited.** `en-GB`, 24-hour (`hourCycle: "h23"`). Never host locale, never en-US.
- **Confirm against the [v2 API reference](https://ts.sdk.modelcontextprotocol.io/v2/api/), don't guess.** Retiring a v2 guess is the whole point of this repo. If you need a v2 API this repo does not already use, read the reference first.

## Verified v2 facts — don't re-derive

| Thing | What this repo proves |
| --- | --- |
| annotations key | `annotations` in the `registerTool` config; asserted client-side by `test/smoke.test.ts` |
| structured output | `outputSchema` is accepted; `structuredContent` is returned and validated by the client |
| errors | a returned `{ isError: true, content }` surfaces as `result.isError` |
| in-memory tests | `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/server`; client from `@modelcontextprotocol/client` |
| stdio entry | `serveStdio(() => createServer(roots))` from `@modelcontextprotocol/server/stdio` — it takes a factory, unlike v1's transport object |
| schemas | zod v4, with `.describe()` on every field |

The 1MCP handshake is proven: the gateway already serves this repo's `get_datetime`, negotiating protocol `2025-11-25` (the installed SDK's version — an earlier spec note claiming 2026-07-28 was wrong). One local caveat: on a machine whose npm sets `ignore-scripts=true`, `npx -y github:…` fails because `prepare` never runs the build — prefix `npm_config_ignore_scripts=false` there; the gateway host needs no override. Verified 2026-09-29.

## The annotation trap

`READ_ONLY` is exactly two hints: `{ readOnlyHint: true, openWorldHint: false }`. Do **not** pad it with `idempotentHint: false` or `destructiveHint: false` — per the MCP spec those two are meaningful only when `readOnlyHint` is `false`, and `server-filesystem` omits them on every read-only tool. Two earlier specs got this wrong, which is why it is written down here.

## Adding a tool

One tool at a time, with its acceptance check, before starting the next.

1. `src/tools/<name>.ts` exporting `register<Name>(server: McpServer, roots: readonly string[])`.
2. `inputSchema` in zod v4. Every input is bounded: numbers carry `.min`/`.max`, closed sets are enums, strings are validated rather than coerced. `.describe()` every field — the description is the model's documentation.
3. `outputSchema` for the object you return.
4. `annotations:` a preset from `src/annotations.ts`.
5. Handler returns `jsonResult(obj)` or `errorResult(message)`. Nothing else.
6. Register it in `src/tools/index.ts` — one line.
7. Tests in `test/`: a success test, and **a rejection test for every input** — wrong type, out of range, bad enum, invalid value. A tool without a rejection test is unfinished.
8. Acceptance: `npm run build && npm test`, then check the tool through a real client. Record any new API fact here.

## Test conventions

Drive the server through the SDK's own client over `InMemoryTransport` — use `connect(roots)` from `test/harness.ts`; never spawn the server itself (`test/rg.test.ts` exercises the subprocess seam directly). Assert on `structuredContent`, and keep one test proving the text payload is the JSON mirror of it.

Time-dependent tools freeze the clock with `useFrozenClock()` and restore it with `useRealClock()`. The frozen instant is `FIXED_NOW_ISO` — 23:30Z on a Monday, chosen so `+09:00`, `+05:45` and `+01:00` all roll the date over.
