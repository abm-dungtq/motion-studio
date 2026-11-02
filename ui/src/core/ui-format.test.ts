import { describe, expect, it } from "vitest";
import { stripVoiceTags } from "./ui-format.ts";

describe("stripVoiceTags", () => {
  it("drops the delivery tags at the start of a line", () => {
    expect(stripVoiceTags("[laughs] Rót hai cốc")).toBe("Rót hai cốc");
    expect(stripVoiceTags(" [whispers][pause] Khẽ thôi")).toBe("Khẽ thôi");
  });
  it("keeps tags inside the line and lines without tags", () => {
    expect(stripVoiceTags("Rót [laughs] hai cốc")).toBe("Rót [laughs] hai cốc");
    expect(stripVoiceTags("Rót hai cốc")).toBe("Rót hai cốc");
  });
});
