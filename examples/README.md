# examples

There is no copy of the example tool here, deliberately.

The template's worked example is **live in the repository**, which is what lets `npm test` on a fresh clone prove the conventions against real code instead of an empty suite:

| File | What it demonstrates |
| --- | --- |
| `src/tools/get-datetime.ts` | Bounded schema, annotation preset, structured output, clean errors |
| `test/get-datetime.test.ts` | Success cases over the SDK's own in-memory client |
| `test/get-datetime.rejections.test.ts` | One rejection per input |
| `test/smoke.test.ts` | Handshake, annotation and schema contract as the client sees them |

A copy under `examples/` would drift from the code it claims to demonstrate; a live example cannot drift from itself.

Instantiation removes the example and its tests, so the generated project is example-free; `docs/adding-a-tool.md` is the walkthrough that replaces it.
