import { describe, expect, it } from "vitest";
import { statusInterval, type VgStatus } from "./api.ts";

describe("statusInterval", () => {
  it("asks every 5 s while a Flow run is going, every 30 s otherwise", () => {
    expect(statusInterval({ job: { id: "1", name: "p" } } as VgStatus)).toBe(5000);
    expect(statusInterval({ job: null } as VgStatus)).toBe(30000);
    expect(statusInterval(undefined)).toBe(30000);
  });
});
