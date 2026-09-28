# Conventions

The canonical rule list for servers built from this template. Rules live beside the code they describe; when a rule and the code disagree, that is a bug in one of them.

At v0.1 this list covers naming, annotations, structured output and the don't-guess rule. The subprocess rules arrive with v0.2.0, because until a server spawns something they describe a threat that does not exist yet — they are listed at the bottom, marked as not yet in force, so the shape of the commitment is visible.

## Naming

- **Package** — lowercase, hyphenated, one word where possible (`mcp-filesearch`). Substituted from `__name__` by `scripts/instantiate.ts`.
- **1MCP config key** — the package name with separators dropped: `mcp-filesearch` → `filesearch`, `mcp-base` → `mcpbase`.
- **Tools** — `snake_case`, verb-first, one distinct verb each: `get_datetime`, `list_matching_files`, `search_content`. No near-synonyms of tools that already exist in another registered server — if `server-filesystem` has `read_file`, this server does not grow a `read_text_file`.

## Annotations

Every tool carries hints, always. The presets in `src/annotations.ts` exist so this cannot be forgotten and hints cannot be hand-rolled per tool.

- Read-only tools use `READ_ONLY`, which is exactly `{ readOnlyHint: true, openWorldHint: false }`.
- Do **not** pad a read-only tool with `idempotentHint: false` or `destructiveHint: false`. Per the MCP spec those two are meaningful only when `readOnlyHint` is `false`, and `server-filesystem` omits them on every read-only tool. Two earlier drafts of the search spec set all four; that is why this is written down.
- Writers use `WRITE_IDEMPOTENT` or `WRITE_DESTRUCTIVE`. If neither fits, the tool is doing more than one thing.

## Inputs

- Every input is bounded. Numbers carry `.min` and `.max`; closed sets are enums; strings are validated rather than coerced.
- `.describe()` every field. That description is the model's only documentation of the tool.
- Every input has a rejection test. A tool without one is unfinished, not nearly finished.

## Output

- Structured output only. Every tool declares an `outputSchema` and returns `jsonResult(obj)` from `src/result.ts`.
- Never hand a client a raw string you did not shape — not process output, not a library's error text.
- Failures return `errorResult(message)`: one clean sentence, no stack trace, no exception class name, no `\n    at `. A stack trace in a tool result is information disclosure.
- Anything that can grow is capped, and says so in its output when the cap bites.

## Locale

Pin it: `en-GB`, 24-hour clock. Never the host locale, never en-US. An unpinned locale makes output depend on the machine, which makes tests pass locally and lie in CI, or the reverse.

## Don't guess — confirm

The API reference is authoritative for SDK v2 shapes: <https://ts.sdk.modelcontextprotocol.io/v2/api/>. Every v2 fact this repo has already verified is tabulated in `AGENTS.md`; read that table before concluding an API does not exist. When you verify a new fact, add it to the table — the point of this repo is that guesses get spent here, once.

## Arriving with v0.2.0 — not yet in force

Nothing here spawns a process yet, so these are commitments rather than live rules. They are stated now so the subprocess layer is written against them rather than retrofitted to them.

- **Never a shell.** `spawn(bin, argvArray, { shell: false })`. No `exec`, no `execSync`, no string command building, no `shell: true`. Arguments go in as an array and are never concatenated into a string.
- **No raw-flag passthrough.** No `extraArgs`, `flags`, `options`, or free-form `args` field on any tool, ever. Every flag the process receives is chosen by our code.
- **Permanently banned flags:** `--pre`, `--pre-glob`, `--pcre2`, `-z` / `--search-zip`, `-L` / `--follow`. The reasoning lands with v0.2.0 — see `SECURITY.md`.
- **Every path is validated:** `realpath` the requested path, assert the resolved result is inside an allowed root, and only then run. Compare resolved paths, never strings. Fail closed. Return paths relative to their root.
- **One subprocess seam.** No `child_process` import anywhere but that one file.
- **Caps and timeouts on everything** that can run long or return a lot.
