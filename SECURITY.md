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

The full threat table — each threat class against its mitigation, with the per-flag reasoning — arrives with the security test suite (Phase 5 of [`docs/implementation-plan.md`](docs/implementation-plan.md)). The reasoning in short: `--pre` runs an arbitrary program against every file, `--pcre2` reintroduces the catastrophic backtracking the default engine makes impossible, `-z` shells out to decompressors, `-L` follows symlinks out of the root.

## Supply chain

Dependencies are pinned by `package-lock.json` and installed with `npm ci` in CI.

Two anti-rot mechanisms are specified but **not yet in place**: weekly Dependabot updates, and a drift test that fails when `@modelcontextprotocol/server` changes major. Until they land, an SDK change arrives silently rather than as a red build — do not assume otherwise.
