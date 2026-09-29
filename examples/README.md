# examples

There is no copy of the example tool here, deliberately.

The worked example is **live in the repository**, which is what lets `npm test` prove the conventions against real code instead of an empty suite:

| File | What it demonstrates |
| --- | --- |
| `src/tools/get-datetime.ts` | Bounded schema, annotation preset, structured output, clean errors |
| `test/get-datetime.test.ts` | Success cases over the SDK's own in-memory client |
| `test/get-datetime.rejections.test.ts` | One rejection per input |
| `test/smoke.test.ts` | Handshake, annotation and schema contract as the client sees them |

A copy under `examples/` would drift from the code it claims to demonstrate; a live example cannot drift from itself.

`get_datetime` is retained here permanently as the liveness probe — when a client can call it, the process is up and the SDK surface is intact. `docs/adding-a-tool.md` is the walkthrough for the tools that join it.
