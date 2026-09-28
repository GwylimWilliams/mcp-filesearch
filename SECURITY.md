# Security

## Reporting

Open a private [security advisory](https://github.com/GwylimWilliams/mcp-base/security/advisories/new) rather than a public issue.

## Current posture — v0.1.0

The proving ground has almost no attack surface, and saying exactly how little is the point:

- **No filesystem access, no network, no subprocess.** Nothing is spawned and no path is read; `get_datetime` reads the system clock.
- **Read-only by default.** Every tool carries the `READ_ONLY` preset, `{ readOnlyHint: true, openWorldHint: false }`, so a client can tell before calling that nothing is mutated.
- **Inputs are schema-validated**, and a validation failure returns a clean tool error naming the offending field. Stack traces, exception class names and internal paths are treated as information disclosure and are never returned.
- **Output is shaped by this code**, never raw output from a tool or a library.

The one security-relevant guarantee the template makes by construction is the annotation preset: a tool cannot be added without stating what it does to the world.

## What v0.2.0 adds

The threat classes this template is designed against — option smuggling, path traversal, symlink escape, catastrophic regex, output flooding, shell-mediated execution — arrive with the subprocess layer, together with the per-flag reasoning for the banned flags: `--pre` runs an arbitrary program, `--pcre2` reintroduces backtracking that the default engine makes impossible, `-z` shells out to decompressors, `-L` escapes the root.

Writing that table now, before there is code to point at, would be theatre. The commitments are recorded in `CONVENTIONS.md` under "Arriving with v0.2.0" and in the build spec in Trilium.

## Supply chain

Dependencies are pinned by `package-lock.json` and installed with `npm ci` in CI.

Two anti-rot mechanisms are specified but **not yet in place**: weekly Dependabot updates, and a drift test that fails when `@modelcontextprotocol/server` changes major. Until they land, an SDK change arrives silently rather than as a red build — do not assume otherwise.
