import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, textOf, useFrozenClock, useRealClock, type Harness } from "./harness.js";

describe("get_datetime rejections", () => {
  let mcp: Harness;

  beforeEach(async () => {
    useFrozenClock();
    mcp = await connect();
  });

  afterEach(async () => {
    await mcp.close();
    useRealClock();
  });

  it("rejects an unknown IANA zone as a clean tool error", async () => {
    const result = await mcp.callError("get_datetime", { timezone: "Not/AZone" });
    const message = textOf(result);
    expect(message).toContain('Invalid IANA timezone: "Not/AZone"');
    expect(message).not.toContain("RangeError");
    expect(message).not.toMatch(/\n\s*at /);
  });

  it.each([
    { input: "a timezone of the wrong type", args: { timezone: 42 }, field: "timezone" },
    { input: "an offsetDays above the maximum", args: { offsetDays: 400 }, field: "offsetDays" },
    { input: "an offsetDays below the minimum", args: { offsetDays: -366 }, field: "offsetDays" },
    { input: "a fractional offsetDays", args: { offsetDays: 1.5 }, field: "offsetDays" },
    { input: "an offsetDays of the wrong type", args: { offsetDays: "1" }, field: "offsetDays" },
    { input: "a format outside the enum", args: { format: "banana" }, field: "format" },
    { input: "a format of the wrong type", args: { format: 42 }, field: "format" },
  ])("rejects $input at the schema", async ({ args, field }) => {
    const result = await mcp.callError("get_datetime", args);
    const message = textOf(result);
    expect(message).toContain("Input validation error");
    expect(message).toContain(field);
    expect(result.structuredContent).toBeUndefined();
  });
});
