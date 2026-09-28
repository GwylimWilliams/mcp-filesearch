<!-- Conventions are enforced at the point of change. See CONVENTIONS.md. -->

## What changed

<!-- One or two sentences: what, and why. -->

## Convention checklist

- [ ] Every new tool carries a preset from `src/annotations.ts` — no hints written inline
- [ ] No read-only tool padded with `idempotentHint` / `destructiveHint`
- [ ] Every input is bounded (`.min` / `.max`, enums, validated strings) and `.describe()`d
- [ ] The tool declares an `outputSchema` and returns `jsonResult()` / `errorResult()` — never a raw string
- [ ] Error messages leak no stack trace, exception class or internal path
- [ ] A rejection test exists for **every** input, asserting a clean error and no `structuredContent`
- [ ] `npm run build && npm test` pass
- [ ] Any v2 API fact verified along the way is recorded in `AGENTS.md`

### Subprocess changes (v0.2.0+)

- [ ] No new `child_process` import — the single `exec` seam only
- [ ] argv array, `shell: false`, no flag passthrough on any tool
- [ ] Paths `realpath`'d and asserted inside a root before running
- [ ] Output capped, timeout set
