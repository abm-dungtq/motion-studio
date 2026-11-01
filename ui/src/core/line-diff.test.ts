import { describe, expect, it } from "vitest";
import { lineDiff } from "./line-diff.ts";

describe("lineDiff", () => {
  it("marks a changed line as removed then added, with context around it", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n");
    const after = before.replace("e", "E");
    expect(lineDiff(before, after, 1)).toEqual([
      { kind: "…", text: "3 dòng không đổi" },
      { kind: " ", text: "d" },
      { kind: "-", text: "e" },
      { kind: "+", text: "E" },
      { kind: " ", text: "f" },
      { kind: "…", text: "4 dòng không đổi" },
    ]);
  });

  it("a new file is all added, a removed one all removed", () => {
    expect(lineDiff(null, "x\ny")).toEqual([{ kind: "+", text: "x" }, { kind: "+", text: "y" }]);
    expect(lineDiff("x", null)).toEqual([{ kind: "-", text: "x" }]);
  });

  it("identical text has no change rows", () => {
    expect(lineDiff("a\nb", "a\nb").every((r) => r.kind === "…")).toBe(true);
  });
});
