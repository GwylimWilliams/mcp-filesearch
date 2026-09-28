# Adding a tool

The unit of work this template exists to standardise. The worked reference is `get_datetime` — read `src/tools/get-datetime.ts` alongside this page; every step below points at the real code rather than a toy version of it.

One tool at a time, acceptance check included, before starting the next. If a step here and the code disagree, the code wins and this page is the bug.

## 1 · Name it

`snake_case`, verb-first, one distinct verb, and not a near-synonym of a tool in another registered server. See `CONVENTIONS.md` → Naming.

## 2 · Write the input schema, with bounds

In `src/tools/<name>.ts`:

```ts
const inputSchema = z.object({
  timezone: z
    .string()
    .default("UTC")
    .describe('IANA timezone name, e.g. "UTC", "Europe/London", "Asia/Tokyo".'),
  offsetDays: z
    .number()
    .int()
    .min(-365)
    .max(365)
    .default(0)
    .describe("Whole days to shift the result, relative to now."),
  format: z
    .enum(["iso", "unix", "human"])
    .default("iso")
    .describe('Adds a localized "human" string when set to "human".'),
});
```

Those three fields are the three shapes almost every real input takes, which is why the example has exactly them:

- a **validated string** — an IANA zone that does not exist must come back as a clean tool error, not a stack trace
- a **bounded number** — `.min` and `.max`, plus `.int()` where fractions are meaningless
- an **enum with a default** — the common case

Copy the nearest one rather than inventing a fourth shape. `.describe()` is not optional: it is the model's only documentation of the field.

## 3 · Declare the output schema

```ts
const outputSchema = z.object({
  iso: z.string().describe("ISO 8601 wall-clock time in the requested zone, carrying that zone's UTC offset."),
  unix: z.number().describe("Seconds since the Unix epoch."),
  timezone: z.string().describe("Canonical IANA name of the resolved zone."),
  human: z.string().optional().describe('Localized rendering; present only when format is "human".'),
});
```

The client validates results against this, so an undeclared field is a bug the client catches rather than a surprise for the caller. Fields that are present only for some inputs are declared `.optional()` and simply omitted.

## 4 · Pick the annotation

```ts
import { READ_ONLY } from "../annotations.js";
```

Read-only is the default and the common case. Never write hints inline — the preset is the convention, and `CONVENTIONS.md` explains why `READ_ONLY` is two hints rather than four.

## 5 · Implement the handler

Validate and resolve first, fail cleanly, then build the declared object and return it:

```ts
const timeZone = resolveZone(timezone);
if (timeZone === undefined) {
  return errorResult(
    `Invalid IANA timezone: "${timezone}". ` +
      'Use a zone name such as "UTC", "Europe/London" or "Asia/Tokyo".',
  );
}
// …build the object…
return jsonResult(result);
```

Two absolutes: the handler never throws — anything fallible is caught and turned into `errorResult` — and the object handed to `jsonResult` matches `outputSchema` exactly.

## 6 · Register it

One line in `src/tools/index.ts`:

```ts
export function registerTools(server: McpServer): void {
  registerGetDatetime(server);
  registerYourTool(server); // ← the whole seam
}
```

## 7 · Test it

In `test/`, driven through the SDK's own client over an in-memory transport — `connect()` from `test/harness.ts`; never a spawned process.

- a success test per meaningful case, asserting on `structuredContent`
- one test proving the text payload is the JSON mirror of it
- **a rejection test for every input**: wrong type, out of range, bad enum, invalid value. Assert the message carries no stack trace and that `structuredContent` is absent
- `useFrozenClock()` for anything time-dependent

`test/get-datetime.rejections.test.ts` is the shape to copy — its cases are tabulated, so adding an input to a tool means adding a row.

## 8 · Acceptance

```
npm run build && npm test
```

Then check it through a real client: the tool appears, its annotations arrive intact, and a call returns the output you designed. `npm test` proves the code; only a real client proves the wiring.

## When the tool backs onto a subprocess (v0.2.0)

Two steps change, and they are the ones this template cares most about:

- **argv construction is added.** Build the argument array in code — flags first, `--` before the positional path, and the user's pattern in a named slot (`-e pattern`) so a value beginning with `-` can never be read as a flag.
- **Path validation precedes the call.** `realpath` the path, assert it is inside an allowed root, then run.

Until that layer exists, a tool that needs a subprocess does not belong in this repo.
