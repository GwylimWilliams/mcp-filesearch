# Security

## Reporting

Open a private [security advisory](https://github.com/GwylimWilliams/mcp-filesearch/security/advisories/new) rather than a public issue.

## Current posture

A read-only server that spawns exactly one program — `rg` — and only against paths inside the roots given on the command line:

- **Read-only.** Every tool carries the `READ_ONLY` preset, `{ readOnlyHint: true, openWorldHint: false }`, so a client can tell before calling that nothing is mutated. There is no write path anywhere in the code.
- **Root-scoped.** Every path is `realpath`ed and asserted inside an allowed root before any subprocess runs — resolved paths compared, never strings — failing closed on anything that does not resolve. Roots come from the CLI, never `cwd`.
- **Never a shell.** The single subprocess seam (`src/rg.ts`) spawns with `shell: false` and an argv array. The banned flags are never passed, and no tool accepts free-form flags.
- **Inputs are schema-validated**, and a validation failure returns a clean tool error naming the offending field. Stack traces, exception class names and internal paths are treated as information disclosure and are never returned; subprocess stderr is logged locally only.
- **Output is shaped and capped by this code**, never raw output from a tool or a library.

These conventions are asserted by [`test/security.test.ts`](test/security.test.ts); the per-tool rejection tests live beside each tool.

## Threat table

| Threat | Mitigation |
| --- | --- |
| Path traversal — `../` sequences, absolute paths outside a root, `..` that lands elsewhere | Every `path` is `realpath`ed and asserted inside an allowed root before anything is spawned; anything that does not resolve is rejected (fail closed). Containment is a separator-anchored check on resolved paths, never a string prefix. |
| Percent-encoded traversal — `%2e%2e` | Never decoded: it is an ordinary filename, reachable only by its literal name. |
| Symlink escape — a symlink inside a root that points outside it | `realpath` resolves links before the containment check, so such a link is rejected like any outside path. `-L` / `--follow` is also banned, so the walker never follows links it meets. |
| Flag smuggling through `pattern`, `glob`, `exclude` or `path` | Inputs are never placed where options are parsed: patterns go in the `-e <pattern>` slot, globs in `-g <glob>`, and `--` precedes the positional path, so a value that looks like a flag is treated as data. No tool has a free-form flags/args field — every flag `rg` receives is chosen in this code. |
| Arbitrary program execution | `--pre` / `--pre-glob` are never passed, and no input can smuggle them (row above). |
| Catastrophic regex backtracking | The default Rust regex engine is linear-time; `--pcre2` is banned. A classic `(a+)+$` against a 5,000-character line completes in well under a second. |
| Decompressor shell-outs | `-z` / `--search-zip` is banned, so `rg` never invokes external decompressors. |
| Resource exhaustion — huge result sets, huge files, long lines, hangs | File lists and per-file counts cap at 500 entries; `search_content` returns at most `maxResults` (default 100, hard max 500) matching lines, each line capped at 500 characters plus an ellipsis; `search_content` skips files over 2 MB (`--max-filesize 2M`); every spawn is killed after 10 seconds. Every cap that bites sets `truncated: true`. |
| Untrusted file content | Content is data, never instructions: C0 control characters (tab excepted) are stripped from returned text, invalid UTF-8 is replaced lossily, and output is always this code's own JSON shape. |
| Information disclosure through errors | Failures are one clean sentence. Stack traces, exception class names and subprocess stderr are never returned to the client; stderr goes to the server's local stderr only. |
| Secret-bearing directories | `.git/` and `.chrome-data/` are excluded by globs appended to every call, whatever the caller asks for. |
| Concurrent calls | Each call builds its own argv and parses its own output; there is no shared mutable state between calls. |

## Banned flags — and why

`--pre`, `--pre-glob`, `--pcre2`, `-z` / `--search-zip` and `-L` / `--follow` are banned in [`CONVENTIONS.md`](CONVENTIONS.md), and the code never constructs them. Why each is the danger:

- `--pre <program>` — runs an arbitrary program, with the file path as its argument, against every file before searching it. On a search server that is arbitrary code execution driven by a request.
- `--pre-glob` — the selector that scopes `--pre`; banned with it, because the capability, not the scoping, is the problem.
- `--pcre2` — switches engines and reintroduces catastrophic backtracking; the default engine is linear-time by construction, which is why `(a+)+$` costs nothing here.
- `-z` / `--search-zip` — shells out to external decompressors for each compressed file, an extra execution surface a read-only search does not need.
- `-L` / `--follow` — makes the walker follow symlinks encountered during a search, including links that leave an allowed root. Without it — and with the `realpath` check — no link can lead outside a root.

## Supply chain

Dependencies are pinned by `package-lock.json` and installed with `npm ci` in CI.

Two anti-rot mechanisms are specified but **not yet in place**: weekly Dependabot updates, and a drift test that fails when `@modelcontextprotocol/server` changes major. Until they land, an SDK change arrives silently rather than as a red build — do not assume otherwise.
