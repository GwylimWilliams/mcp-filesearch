# mcp-filesearch — implementation plan

**This is the canonical, repo-local plan for building this server. One phase per session.**

Each phase is self-contained: it lists what already exists, what to build, the exact shapes (schemas, argv, outputs), the tests, and the acceptance checks. Implement one phase, run its checks, update the status table, commit to `main`, **stop and report**. Do not start the next phase until the current one's checks pass.

- **Source of truth:** this file is the "do this". The reasoning lives in Trilium: spec note `IEuXIKPeABER` (its **"Phase 0 — final revision"** supersedes earlier phase text, and its reordering section made `mcp-base` run first — already done), design rationale `ZlTiZQtIeJvh`, mcp-base build spec `UUo1vA9cn1rD`, tool-layer rule `tHepTfnotkvY`.
- Where this plan deliberately corrects the Trilium spec, the correction is marked ⚠️ and the reason given. Report new findings back to Trilium at the end of each phase.
- Baseline state recorded at commit `3349e41`. Line numbers refer to that commit.

## How to run a phase (session protocol)

1. **Start:** read this document's "Current state", "Settled decisions", and the one phase section. Do not read ahead.
2. **Implement:** exactly the phase's work items. No improvisation — if blocked, stop and report (most workarounds here route through a shell, which this design forbids).
3. **Check:** run the phase's acceptance checks; keep the raw results.
4. **Record:** update the status table below (state, commit, date, check results).
5. **Commit:** one commit to `main`. CI runs on push (Node 22 + 24).
6. **Stop and report:** what changed, check results, any new SDK/API facts, anything for Trilium.

## Status

| Phase | Deliverable | State | Commit | Notes |
| --- | --- | --- | --- | --- |
| 0 | Scaffold completion: roots, CLI args, rg seam, doc/identity cleanup, npx check | **complete** — 2026-09-29 | `a1efbfe` | build+test green (5 files, 43 tests); probe lists exactly `get_datetime`; no-arg usage exits 1; `child_process` seam grep clean; template-ref grep clean; npx check green (local ignore-scripts override); CI `36560803824` green (22+24) |
| 1 | `list_allowed_dirs` | **complete** — 2026-09-29 | `55a7fea` | build+test green (6 files, 46 tests); probe lists both tools with read-only hints intact; call returns the resolved roots; no subprocess (rg not imported by any tool); CI `36562339931` green (22+24) |
| 2 | `list_matching_files` | **complete** — 2026-09-29 | `a070ff0` | build+test green (7 files, 69 tests); probe lists three tools with read-only hints; real-client `tools/call` returns `a.md` with `.git` secret absent; invalid glob → clean error (rg exit 2, recorded); no-match → empty list; CI `36564039822` green (22+24) after `383d6d5` installs rg |
| 3 | `count_matches` | not started | — | |
| 4 | `search_content` | not started | — | open decisions to settle first |
| 5 | Security test suite (`test/security.test.ts`) | not started | — | |
| 6 | Packaging & 1MCP registration verification | not started | — | gateway entry already exists |

## Current state (verified this session, baseline `3349e41`)

**Repo.** Public, `github.com/GwylimWilliams/mcp-filesearch`, instantiated by hand from `mcp-base` (commit `3349e41 Instantiate the template as mcp-filesearch`, on top of the template's `Initial commit`). Working tree clean. CI green on both pushes (runs `36493666438`, `36495203480`). Local `npm run build && npm test` green: **3 files, 22 tests**.

**Code map.**

| File | State | Relevance |
| --- | --- | --- |
| `src/index.ts` (5 lines) | `serveStdio(createServer)` — **no CLI arg parsing yet** | Phase 0 wires roots in here |
| `src/server.ts:6-13` | `createServer(): McpServer` takes **no arguments**; name `mcp-filesearch`, version `0.1.0` | gains a `roots` parameter in Phase 0 |
| `src/tools/index.ts:4-6` | `registerTools(server)` seam, one line per tool | every phase adds one line |
| `src/tools/get-datetime.ts` | `get_datetime` — **retained permanently** as liveness probe (both specs confirm) | the pattern to copy for every new tool |
| `src/annotations.ts:3-6` | `READ_ONLY = { readOnlyHint: true, openWorldHint: false }` — already correct | import this; never hand-write hints |
| `src/result.ts:10-22` | `jsonResult(obj)` / `errorResult(message)` / `truncate(text)` | every tool returns one of these |
| `test/harness.ts:39-69` | SDK client over `InMemoryTransport`; `connect()` calls `createServer()` **at line 40** | gains a `roots` argument in Phase 0 |
| `test/smoke.test.ts`, `test/get-datetime*.test.ts` | 22 tests; patterns for success + rejection suites | copy the shape |
| `src/placeholders.ts` | template substitution contract, **unused in this repo** | deleted in Phase 0 |
| `.github/workflows/ci.yml` | `npm ci && npm run build && npm test` on Node 22 and 24, push + PR | |
| `CONVENTIONS.md` / `AGENTS.md` | canonical rules + agent-facing restatement & per-tool checklist; subprocess rules marked "not yet in force" (CONVENTIONS.md:42-51) | reframed in Phase 0; rules come into force as rg lands |
| `SECURITY.md` | "proving ground" posture; advisory URL points at `mcp-base` | threshold table arrives in Phase 5 |

**Handshake probe (verified).** `node dist/index.js /tmp` (root arg currently ignored) responds:

- `protocolVersion: "2025-11-25"` — ⚠️ the Trilium spec said "built against the 2026-07-28 spec"; the installed SDK v2.2.0 actually negotiates **2025-11-25**. Record this fact; it is what 1MCP already accepts (gateway proof below).
- `serverInfo: { name: "mcp-filesearch", version: "0.1.0" }`.
- `tools/list` → exactly `get_datetime`, with `annotations: { readOnlyHint: true, openWorldHint: false }`, full input/output schemas, and no extra tools. (The tool list currently has **1** tool; after Phase 1 it has 2, and so on.)

**Environment.** Node 24.13.0 locally (CI: 22 + 24); npm 11.6.2; `rg` 15.2.0 at `/usr/bin/rg`. ⚠️ **Correction (Phase 2): GitHub's `ubuntu-latest` no longer ships `rg`** — the first Phase 2 CI run failed with `spawn rg ENOENT` on both Node versions; the workflow now installs it via apt (`383d6d5`). No `/silverbullet` on this machine — that root exists only on the 1MCP gateway host. **`~/.npmrc` sets `ignore-scripts=true`** (deliberate) — see the npx caveat below.

**Gateway.** 1MCP already serves a `filesearch` server, and its `get_datetime` calls succeed (verified live: `filesearch_1mcp_get_datetime`). Phase 6 is therefore *verification*, not setup.

**⚠️ npx caveat — this machine's `ignore-scripts=true` (verified).** On this dev box, `npx -y github:GwylimWilliams/mcp-filesearch` fails with `sh: line 1: mcp-filesearch: command not found` (exit 127): `ignore-scripts=true` suppresses `prepare`, so the git install never runs `tsc`; `dist/` is gitignored and therefore absent from the fetched tarball, and the `bin` entry dangles. **This is a local npm-configuration fact, not a repo defect.** Re-running with scripts enabled works end to end:

```
npm_config_ignore_scripts=false npx -y github:GwylimWilliams/mcp-filesearch /tmp
```

…starts the server, negotiates `2025-11-25`, and lists `get_datetime` with annotations intact (cold cache ~1–2 min: clone + devDeps + build). The gateway host has no such setting — which is why 1MCP already serves `filesearch`. Consequences: on **this machine**, prefix npx checks with `npm_config_ignore_scripts=false`; leave registrations as the plain `github:` form; do **not** "fix" this by committing `dist/` (the spec forbids it) or by editing the global npmrc. If an npx run ever fails *with* scripts enabled, that is a real packaging bug — stop and report.

**Template references still present (Phase 0 cleanup targets).** `README.md` (still titled `# mcp-base`), `AGENTS.md:3` + `:27`, `CONVENTIONS.md:5-11` (naming examples + v0.1 framing), `SECURITY.md:5` (advisory URL) + `:18-22`, `examples/README.md:14`, `package.json:4` (description), `src/placeholders.ts`.

## Settled decisions (apply to every phase)

- **Hard constraints** (violating any is a bug, not a style choice): never a shell — `spawn(bin, argvArray, { shell: false })`; no raw-flag passthrough on any tool; never these flags: `--pre`, `--pre-glob`, `--pcre2`, `-z`/`--search-zip`, `-L`/`--follow`; every path `realpath`ed and asserted inside an allowed root before running (fail closed); no writes ever; structured JSON output only; subprocess stderr is logged locally only and never returned. Canonical list: `CONVENTIONS.md`; agent checklist: `AGENTS.md`.
- **Per-tool checklist:** `src/tools/<name>.ts` exporting `register<Name>(server, roots)`; bounded zod v4 schemas with `.describe()` on every field; `outputSchema`; a preset from `src/annotations.ts`; handlers return only `jsonResult`/`errorResult`; one line in `src/tools/index.ts`; success test + **a rejection test per input**; real-client check. Worked walkthrough: `docs/adding-a-tool.md`.
- **`createServer` gains roots:** `createServer(roots: readonly string[])` (`src/server.ts`), forwarded to `registerTools(server, roots)`; `src/index.ts` parses `process.argv.slice(2)`; `test/harness.ts` `connect(roots: readonly string[])` passes them through.
- **No args ⇒ exit non-zero with a usage message.** Never default to `cwd` or `/`. Roots are `realpath`ed at startup; duplicates collapsed.
- **The rg seam:** every subprocess in the repo goes through `src/rg.ts` — the **only** file that imports `child_process`. `runBin(bin, argv, { cwd, timeoutMs, okCodes })` is the general form (backport target: `mcp-base`'s `exec.ts`); `runRg(argv, cwd, timeoutMs = 10_000)` wraps it with `bin = 'rg'`, `okCodes = [0, 1]`. **Exit 1 means "no matches", not an error** (the one thing kept from `mcp-ripgrep`). Any other exit code, a spawn error, or a timeout rejects with a clean message; non-empty stderr is written to local stderr, never returned. rg matches slash-containing `-g` globs relative to the child's **cwd**, so tools pass the searched path as cwd and slash-globs are relative to what was asked for (Phase 2 finding; Phase 3/4 must do the same).
- **Paths:** compare resolved paths, never strings; return paths **relative to their root**; `.git/` and `.chrome-data/` are always excluded via appended globs; `--no-ignore-vcs` is on by default, kept as a module-level constant so the decision is visible and reversible in one place.
- **Caps:** file list cap 500; `maxResults` default 100 (range 1–500); subprocess timeout 10 s; `--max-columns 500`; `--max-filesize 2M`; plus a code-side ~500-char cap on each returned line's `text` (belt-and-braces — rg's flag alone is not trusted to bound the JSON payload). Anything capped sets `truncated: true`.
- **Tests:** drive the server through `connect()` (in-memory, never a spawned server); assert on `structuredContent`; keep one text-payload-is-JSON-mirror test per tool; freeze the clock only for time-dependent tools. Fixture trees are **materialised per test into a temp dir** (helper in `test/`) — symlinks, binary files, long lines, invalid UTF-8, `.git/`/`.chrome-data/` — so no binary fixtures are committed. `rg`-requiring tests run in CI, which installs ripgrep explicitly (`ubuntu-latest` no longer ships it); the seam itself is tested with `process.execPath`, so its tests run anywhere.
- **Naming:** tools `snake_case`, verb-first, distinct verbs: `list_allowed_dirs`, `list_matching_files`, `count_matches`, `search_content`. (The rationale note's earlier `find_files` name is superseded.) 1MCP config key: `filesearch`.
- **Versions:** SDK v2 (`@modelcontextprotocol/server` ^2.2.0, zod ^4) stays. The v1 fallback is **not** expected — v2 is proven against 1MCP — but if a handshake ever fails, the documented retreat is v1 imports + zod v3, an import-level change.
- **`get_datetime` stays** as the liveness probe. Never delete it.

## Phase 0 — scaffold completion

**Goal:** roots parsing, CLI arg wiring, the rg seam, template-identity cleanup, and the corrected npx check. Then **stop and report**.

**Already verified (re-check anyway, cheap):** `package.json` `name`/`bin` say `mcp-filesearch`; the `McpServer` name matches; CI green; build+tests green; handshake lists exactly `get_datetime`.

### 0.1 — `src/roots.ts` + `test/roots.test.ts`

Allowed-root parsing and path validation. No tool uses it yet — the tests are the point.

```ts
export function parseRoots(args: readonly string[]): { roots: string[] } | { error: string }
// realpath each arg; must resolve to an existing directory; dedupe by resolved path;
// any failure => { error } naming the offending arg

export function resolveInRoots(requested: string, roots: readonly string[]): { path: string } | { error: string }
// realpath the requested path (ENOENT or any failure => reject: FAIL CLOSED)
// resolved must equal a root, or be inside one (prefix match on resolved + path.sep)
// reject otherwise

export function relativeToRoot(resolvedAbs: string, roots: readonly string[]): string
// output helper: path relative to the containing root
```

Tests (rejection cases are the deliverable):

- `../../etc/passwd` → rejected
- an absolute path outside every root → rejected
- a symlink **inside** the root pointing **outside** → rejected (realpath resolves the target)
- a non-existent path → rejected (fail closed)
- the root itself → accepted; a path inside the root → accepted
- `%2e%2e` arrives as a literal filename, not path traversal → rejected (ENOENT) — asserted explicitly in Phase 5
- duplicate roots collapse; `parseRoots([])` → error

### 0.2 — CLI wiring (`src/index.ts`, `src/server.ts`, `test/harness.ts`)

- `src/index.ts`: `const args = process.argv.slice(2)`; no args ⇒ usage message on **stderr** + `process.exit(1)`; `parseRoots` failure ⇒ message + exit non-zero; else `serveStdio(() => createServer(roots))` (the factory form is what this SDK takes — verified).
- `src/server.ts`: `createServer(roots: readonly string[])`, forwarding to `registerTools(server, roots)`; `src/tools/index.ts` updates its signature.
- `test/harness.ts:40`: `connect(roots)` passes the roots; existing tests pass a fixture (or `/tmp`) root.

### 0.3 — `src/rg.ts` + `test/rg.test.ts`

The single subprocess seam (contract in "Settled decisions"). Implementation notes:

- `spawn(bin, argv, { shell: false, cwd, timeout: timeoutMs })`; collect stdout/stderr; resolve `{ code, stdout, stderr }` for `okCodes`; reject otherwise (clean message including the exit code, never raw stderr content); on `'error'` (e.g. ENOENT rg) reject cleanly; on timeout the child is killed and the promise rejects.
- Non-empty stderr on failure: write to `process.stderr` (local log only) — tool results must stay clean.

Tests — **spawn `process.execPath` as the child**, so these run without `rg` (CI-safe):

- `-e "process.exit(0)"` → resolves, code 0
- `-e "process.exit(1)"` → **resolves** (with the wrapper's `okCodes`) — "no matches" is not an error
- `-e "process.exit(2)"` → rejects
- a bin that does not exist (`no-such-bin-xyz`) → rejects cleanly (no stack leak)
- `-e "setInterval(()=>{},1000)"` with `timeoutMs: 100` → rejects within a small bound; **the child is killed** (assert it is no longer running)

### 0.4 — npx check (no code change; environment caveat)

The spec's command is correct as written; on **this machine** it needs lifecycle scripts enabled (`~/.npmrc` sets `ignore-scripts=true` — see the caveat above). Run the acceptance check below with the `npm_config_ignore_scripts=false` prefix; a cold cache costs ~1–2 min (clone + devDeps + `tsc`). No repo change, and nothing to backport, for this item.

### 0.5 — Doc & identity cleanup (full)

The spec's check is **"no remaining `mcp-base` references anywhere in the tree"** — applied everywhere except this plan document, which deliberately names `mcp-base` as the backport target. Current offenders and their treatment:

1. `README.md` — rewrite for this project: what it is (read-only, root-scoped filesystem search over `rg`), status pointer to this plan, dev loop, and the 1MCP registration snippet **using the git-URL form and the root as a CLI arg** (never `cwd`).
2. `AGENTS.md` — intro reframed to this repo (instantiated *from* mcp-base, but no "here" ambiguity); update "nothing here spawns a process today" once `rg.ts` lands; "Not yet proven… 1MCP handshake" → record the verified facts (protocol 2025-11-25; annotations/structured output already tabulated; the npx `ignore-scripts` caveat).
3. `CONVENTIONS.md` — drop the "§ Arriving with v0.2.0 — not yet in force" framing: the subprocess rules come **into force** with `rg.ts`; naming examples lose `mcp-base`.
4. `SECURITY.md` — advisory URL → this repo's; posture section updated (a subprocess exists now: root-scoped, shell-free); note that the threat/flag-reasoning table arrives in Phase 5.
5. `examples/README.md` — the example is **retained** (liveness probe), not deleted at instantiation; fix that sentence.
6. `package.json:4` — description → "Read-only, root-scoped filesystem search MCP server." (or similar).
7. Delete `src/placeholders.ts` (template substitution machinery; unused here — nothing imports it).
8. Verify: `git grep -nE "mcp-base|mcpbase|__name__" -- . ':!docs/implementation-plan.md'` → **empty** (the pathspec excludes this plan — see above); rebuild so the stale `dist/placeholders.js` disappears.

### Phase 0 acceptance — then **stop and report**

- [ ] `npm run build` clean; `npm test` green; CI green after push.
- [ ] Handshake probe lists **exactly** `get_datetime` (root arg now honoured):
      `{ printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2; } | node dist/index.js /tmp`
- [ ] `node dist/index.js` (no root) → non-zero exit, usage on stderr.
- [ ] `git grep -rn "child_process" src/` → exactly one file: `rg.ts`.
- [ ] `roots.ts` tests: traversal, absolute-outside, symlink-outside all rejected.
- [ ] `rg.ts` tests: exit 0 resolves; exit 1 resolves with empty output; exit 2 rejects; timeout kills the child and rejects cleanly.
- [ ] `npm_config_ignore_scripts=false npx -y github:GwylimWilliams/mcp-filesearch /tmp` starts and lists `get_datetime` (the override is this machine's npmrc caveat; cold cache ~1–2 min). Verified working on 2026-09-29.
- [ ] `git grep -nE "mcp-base|mcpbase|__name__" -- . ':!docs/implementation-plan.md'` → empty (this plan excluded by design).

**Kickoff prompt for a new session:** *"Read docs/implementation-plan.md and implement Phase 0 exactly. Run its acceptance checks, update the status table, commit to main, then stop and report."*

## Phase 1 — `list_allowed_dirs`

The simplest tool: no subprocess. It proves the plumbing, the output convention, and the annotations before anything touches `rg`.

New file `src/tools/list-allowed-dirs.ts` (copy the register shape from `src/tools/get-datetime.ts:96-128`):

```ts
server.registerTool(
  "list_allowed_dirs",
  {
    description: "List the directories this server is permitted to search.",
    inputSchema: z.object({}),
    outputSchema: z.object({ directories: z.array(z.string()).describe("Resolved allowed roots.") }),
    annotations: READ_ONLY,
  },
  async () => jsonResult({ directories: [...roots] }),
);
```

⚠️ **Annotation correction (supersedes the original spec text):** use the `READ_ONLY` preset from `src/annotations.ts` — exactly `{ readOnlyHint: true, openWorldHint: false }`. The original Phase 1 example set all four hints; that is wrong — `idempotentHint`/`destructiveHint` are meaningful only when `readOnlyHint` is false, and `server-filesystem` omits them on read-only tools. The repo already does it correctly.

**Tests** (`test/list-allowed-dirs.test.ts`): returns the resolved roots as an array (assert against the roots passed to `connect()`); the tool appears client-side carrying the read-only hints (extend or mirror `test/smoke.test.ts`); no subprocess — by construction (no `rg` involvement), and the tool list remains `["get_datetime", "list_allowed_dirs"]` (order per registration order).

**Acceptance:** returns resolved roots; appears with read-only hints; no subprocess spawned.

## Phase 2 — `list_matching_files`

```
Tool:   list_matching_files
Input:  glob (string, required), path? (string), exclude? (string[])
Output: { files: string[], truncated: boolean }
```

- `path` defaults to the single configured root **when exactly one root is configured**; with multiple roots and no `path`, return a clean tool error (decide-at-start: this is the plan's choice — the spec is silent).
- `resolveInRoots(path)` **before** any spawn (`../../etc` never reaches the subprocess).
- Argv (absolute resolved path last, after `--`):

```
['--files',
 '--no-ignore-vcs',
 '-g', glob,
 '-g', '!**/.git/**',
 '-g', '!**/.chrome-data/**',
 ...exclude.flatMap(e => ['-g', '!' + e]),
 '--', resolvedPath]
```

- `--files` lists exactly what *would* be searched. `--no-ignore-vcs` and the two always-on exclusion globs are module-level constants.
- Hard cap 500 returned files; set `truncated: true` when it bites. Return paths **relative to their root** (rg emits absolute paths when given an absolute path — relativise in code).

**Tests** (`test/list-matching-files.test.ts`, fixture tree from the helper):

- `glob: "*.md"` returns Markdown files as relative paths (assert exact set)
- `glob: "-e"` and `glob: "--files"` behave as **literal glob patterns**, not flags (option-smuggling test — passes by construction because of argv; assert zero/expected matches, not errors)
- `path: "../../etc"` rejected before any subprocess runs
- a file inside `.git/` never appears, even with a matching glob
- `exclude: ["*.txt"]` filters; unknown/invalid glob → clean error or empty result (assert whichever rg does; record)
- `truncated: true` when > cap files match (fixture with cap+1 files)
- Schema rejections: wrong types for `glob`/`path`/`exclude`

**Acceptance:** the four spec checks above; plus the real-client probe:

```
{mkdir -p /tmp/fs-demo/.git; printf '# a\n' > /tmp/fs-demo/a.md; printf 'x\n' > /tmp/fs-demo/.git/secret.md; }
… probe with root /tmp/fs-demo and …
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_matching_files","arguments":{"glob":"*.md"}}}
```

## Phase 3 — `count_matches`

```
Tool:   count_matches
Input:  pattern (required), path?, glob?, fixedStrings?, caseSensitive?, countLines? (default true)
Output: { counts: { file: string, count: number }[], total: number, truncated: boolean }
```

Argv:

```
[countLines ? '-c' : '--count-matches',
 '--no-heading', '--no-ignore-vcs',
 ...(glob ? ['-g', glob] : []),
 '-g', '!**/.git/**', '-g', '!**/.chrome-data/**',
 ...(fixedStrings ? ['-F'] : []),
 ...(caseSensitive ? ['-s'] : ['-i']),
 '-e', pattern,
 '--', resolvedPath]
```

- This is the **only** place rg's text output is parsed, and it is safe because `-c`/`--count-matches` emit exactly one stable `path:count` line per matching file. Parse by splitting on the **last** `:` (paths may contain colons; rg prints `path:count`). Everything else in this project uses `--json`.
- `total` = sum over **all** counts; the returned `counts` array is capped at 500 entries with `truncated: true` (decide-at-start: the spec fixes no number for this tool; 500 matches the list cap).
- Empty result → `{ counts: [], total: 0, truncated: false }`; exit 1 from rg is normal here (no matches).
- Bounds (proposed): `pattern` `.min(1).max(1000)`, `glob` `.min(1).max(500)`, `path` `.min(1)`.

**Tests:** counts match a manual `rg -c` over the same fixture tree; output stays small on a large match set (fixture with many matches); `pattern: "--pre=/bin/sh"` returns zero matches and executes nothing; `fixedStrings` + `caseSensitive` behave; schema rejections per input.

**Acceptance:** the three spec checks; smoke: `count_matches` on the fixture finds the expected per-file counts.

## Phase 4 — `search_content` (the workhorse)

```
Tool:   search_content
Input:  pattern (required)
        path?
        glob?
        fixedStrings?   (default false)
        caseSensitive?  (default false)
        contextLines?   (0–10, default 0)
        maxResults?     (1–500, default 100)
Output: { matches: { file, line, column, text }[], count, truncated }
```

Argv:

```
['--json',
 '--no-ignore-vcs',
 '--max-columns', '500',
 '--max-filesize', '2M',
 ...(fixedStrings ? ['-F'] : []),
 ...(caseSensitive ? ['-s'] : ['-i']),
 ...(contextLines > 0 ? ['-C', String(contextLines)] : []),
 ...(glob ? ['-g', glob] : []),
 '-g', '!**/.git/**',
 '-g', '!**/.chrome-data/**',
 '-e', pattern,
 '--', resolvedPath]
```

Three deliberate details:

- `--json` replaces `-n`/`--with-filename`/`--no-heading` — it carries path, line and column.
- `-e pattern` puts the pattern in a named slot, so a pattern starting with `-` can never be read as a flag; `--` terminates options before the positional path.
- `--pcre2` is **never** added: the default Rust regex engine is linear-time, so catastrophic backtracking is impossible; `--pcre2` would reintroduce it deliberately.

**Parsing the `--json` stream:** line-delimited JSON events — `begin` (path), `match` (line_number, `lines.text` base64, `submatches[]` with `start`/`end`), `context`, `end`, `summary`. For each `match`: file from the open `begin`; `line` from `line_number`; `text` = base64-decode `lines.text`, strip the trailing newline, then **code-cap at ~500 chars**; `column` from the first submatch (see open decisions). Treat missing/odd fields defensively (skip the entry) — binary files and invalid UTF-8 must not crash the parser. Apply `maxResults` **in code after parsing** — rg's `--max-count` is per-file, not global — and set `truncated: true` when the cap bites.

### Open decisions — settle before implementing

The spec under-specifies these; recommendation in each case, confirm at phase start:

1. **`contextLines` output shape.** The declared output has no place to put context lines, but `-C` makes rg emit them. *Recommended:* add an **optional** `context?: { line: number, text: string }[]` to each match (declared in `outputSchema`), populated from adjacent `context` events; `contextLines` still 0–10.
2. **Multiple matches on one line.** *Recommended:* one entry per **line**, `column` = first submatch's start + 1; `count` therefore counts lines, consistent with `--max-columns` and with "thousands of lines → exactly `maxResults` entries".
3. **Control characters in returned text.** The rationale note flags file content as untrusted input. *Recommended:* strip C0 control chars except `\t` from `text` before returning.

**Tests** (fixture tree): known literal phrase → right file/line/text; `fixedStrings: true` with `a.b[` matches literally; `pattern: "(a+)+$"` completes well under a second; thousands of matching lines → exactly `maxResults` entries + `truncated: true`; `pattern: "--pre=touch /tmp/pwned"` returns zero matches and `/tmp/pwned` does not exist afterwards; a 5,000-char line returns text capped at ~500 chars; binary file and invalid UTF-8 do not crash; `path: "../../etc/passwd"` rejected **before** any subprocess runs; schema rejections per input (incl. `contextLines: 11`, `maxResults: 501`).

**Acceptance:** the eight spec checks; real-client probe with a `tools/call` on the fixture.

## Phase 5 — security test suite

`test/security.test.ts` — the definition of "properly implemented" and the file `mcp-base` will backport unchanged. Consolidate/duplicate the per-phase rejection tests as needed; this file asserts the **conventions**, not the search logic:

- path traversal: `../../etc/passwd`; absolute path outside the root; `%2e%2e` encoded input
- option smuggling: pattern `--pre=/bin/sh`; path `-e`; glob starting with `-`; pattern `--files`
- a symlink inside the root pointing outside → rejected
- catastrophic regex `(a+)+$` → fast
- huge result set → capped with `truncated: true`
- binary file, very long line, invalid UTF-8
- subprocess timeout → child killed, clean error surfaced (seam-level with `process.execPath`; tool-level: clean `errorResult`)
- concurrent tool calls (`Promise.all` over the harness) → no interleaving or corruption; each result matches its own arguments
- `list_allowed_dirs` never widens beyond the CLI args

Also in this phase: fill `SECURITY.md`'s threat table — the threat classes above, each with its mitigation, plus the reasoning behind each banned flag (`--pre` runs an arbitrary program against every file; `--pcre2` reintroduces backtracking; `-z` shells out to decompressors; `-L` escapes the root).

**Acceptance:** `npm test` green; every case above present and named; the suite passes with `rg` present (CI) and the seam tests pass without it.

## Phase 6 — packaging & registration

1. **npx check:** `npx -y github:GwylimWilliams/mcp-filesearch /silverbullet` starts a working server (on this machine prefix `npm_config_ignore_scripts=false`; the gateway needs no override).
2. **1MCP:** the `filesearch` entry already exists and already serves `get_datetime`. Verify: the full tool list reaches 1MCP (all five: `get_datetime`, `list_allowed_dirs`, `list_matching_files`, `count_matches`, `search_content`); annotations arrive intact; a call returns the designed output. Record the exact registered command for the record — the `github:` form is fine; no override is needed on the gateway.
3. Registration shape for the record (scoping comes from the **root argument**, never `cwd`):

```json
"filesearch": {
  "command": "npx",
  "args": ["-y", "github:GwylimWilliams/mcp-filesearch", "/silverbullet"],
  "tags": ["notes", "search"]
}
```

4. Retire the `silverbullet-grep` entry; leave `ripgrep` in the container image unless nothing else uses it.
5. README final pass (registration snippet, dev loop, pointer to this plan).

### After Phase 6 — follow-ups (other repos / Trilium)

- **Backport to `mcp-base` (`v0.2.0`):** `src/exec.ts` generalised from this repo's `rg.ts`; `src/roots.ts`; `test/security.test.ts`; CONVENTIONS/SECURITY gained text; template README registration form fixed (git URL, not `github:`); re-tag.
- **Trilium:** record the corrected facts — negotiated protocol is `2025-11-25` (not 2026-07-28); `npx -y github:…` works as written (an apparent local failure was this dev box's `ignore-scripts=true`, documented in the plan); final gateway args.

## Explicitly out of scope

`read_file`; any write, edit, delete or move; `exec`; directory creation; MCP resources and prompts (the resources/protopints surface stays untouched); dynamic MCP Roots support (the rationale note floats it as optional — the final spec omits it); `get_datetime` removal (it is the liveness probe). `server-filesystem` owns read/write and keeps `edit_file` — this server must not duplicate it.

**Watch item:** 1MCP leaves tool names un-prefixed, so every server instantiated from `mcp-base` exposes an identically-named `get_datetime`. Fine at two servers; at three or more, dedupe at the gateway or lift the tool into its own `mcp-datetime` server.
