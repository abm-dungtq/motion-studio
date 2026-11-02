import { describe, expect, it } from "vitest";
import { POLL_MS, previewsInterval } from "./api.ts";

describe("previewsInterval", () => {
  it("stops asking once the project is in no series", () => {
    expect(previewsInterval(null)).toBe(false);
  });
  it("keeps asking while previews may come, or before the first answer", () => {
    expect(previewsInterval({ roles: [] } as never)).toBe(POLL_MS);
    expect(previewsInterval(undefined)).toBe(POLL_MS);
  });
});
