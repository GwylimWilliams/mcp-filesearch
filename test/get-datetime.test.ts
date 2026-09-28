import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  connect,
  FIXED_NOW_ISO,
  FIXED_NOW_UNIX,
  textOf,
  useFrozenClock,
  useRealClock,
  type Harness,
} from "./harness.js";

const SECONDS_PER_DAY = 86_400;

describe("get_datetime", () => {
  let mcp: Harness;

  beforeEach(async () => {
    useFrozenClock();
    mcp = await connect();
  });

  afterEach(async () => {
    await mcp.close();
    useRealClock();
  });

  it("reports the pinned instant in UTC by default", async () => {
    const out = await mcp.callOk("get_datetime");
    expect(out).toEqual({
      iso: FIXED_NOW_ISO,
      unix: FIXED_NOW_UNIX,
      timezone: "UTC",
    });
  });

  it.each([
    { timezone: "Asia/Tokyo", iso: "2026-09-29T08:30:00.000+09:00" },
    { timezone: "America/New_York", iso: "2026-09-28T19:30:00.000-04:00" },
    { timezone: "Europe/London", iso: "2026-09-29T00:30:00.000+01:00" },
  ])("renders the wall clock in $timezone", async ({ timezone, iso }) => {
    expect(await mcp.callOk("get_datetime", { timezone })).toEqual({
      iso,
      unix: FIXED_NOW_UNIX,
      timezone,
    });
  });

  it("renders a half-hour offset zone", async () => {
    const out = await mcp.callOk("get_datetime", { timezone: "Asia/Kathmandu" });
    expect(out.iso).toBe("2026-09-29T05:15:00.000+05:45");
  });

  it("returns the zone name ICU resolves, not the input spelling", async () => {
    // IANA spells it "Asia/Kathmandu"; Node's ICU prefers "Asia/Katmandu".
    const out = await mcp.callOk("get_datetime", { timezone: "Asia/Kathmandu" });
    expect(out.timezone).toMatch(/^Asia\/Kat(h)?mandu$/);
  });

  it("tracks daylight saving (Europe/London is GMT in January)", async () => {
    useFrozenClock(Date.parse("2026-01-15T12:00:00.000Z"));
    expect(await mcp.callOk("get_datetime", { timezone: "Europe/London" })).toEqual({
      iso: "2026-01-15T12:00:00.000Z",
      unix: 1_768_478_400,
      timezone: "Europe/London",
    });
  });

  it("omits human unless the human format is requested", async () => {
    for (const format of ["iso", "unix"]) {
      const out = await mcp.callOk("get_datetime", { format });
      expect(out).not.toHaveProperty("human");
    }
  });

  it("renders human text in the requested zone", async () => {
    const utc = await mcp.callOk("get_datetime", { format: "human", timezone: "UTC" });
    expect(utc.human).toContain("28 September 2026");
    expect(utc.human).toContain("23:30:00");

    const tokyo = await mcp.callOk("get_datetime", { format: "human", timezone: "Asia/Tokyo" });
    expect(tokyo.human).toContain("29 September 2026");
    expect(tokyo.human).toContain("08:30:00");
  });

  it("shifts the instant by whole days", async () => {
    const base = await mcp.callOk("get_datetime");
    const shifted = await mcp.callOk("get_datetime", { offsetDays: 1 });
    expect(shifted.iso).toBe("2026-09-29T23:30:00.000Z");
    expect(Number(shifted.unix) - Number(base.unix)).toBe(SECONDS_PER_DAY);
  });

  it.each([365, -365])("accepts the boundary offset %i", async (days) => {
    const base = await mcp.callOk("get_datetime");
    const shifted = await mcp.callOk("get_datetime", { offsetDays: days });
    expect(Number(shifted.unix) - Number(base.unix)).toBe(days * SECONDS_PER_DAY);
  });

  it("returns structured content mirroring the text payload", async () => {
    const result = await mcp.client.callTool({
      name: "get_datetime",
      arguments: { timezone: "Asia/Tokyo", format: "human" },
    });
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
  });
});
