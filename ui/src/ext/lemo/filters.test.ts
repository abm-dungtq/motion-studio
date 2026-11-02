import { describe, expect, it } from "vitest";
import { LIBRARY, MINE, PROFILES } from "./fixtures.ts";
import { NO_GROUP, countBy, filterStyles, type LemoStyle } from "./store.ts";

const rows = [...MINE, ...PROFILES, ...LIBRARY] as LemoStyle[];

describe("countBy", () => {
  it("counts each group with the source filter kept, and puts profiles and own styles in no group", () => {
    expect(Object.fromEntries(countBy(rows, { group: "", source: "" }, "group"))).toEqual({ [NO_GROUP]: 2, Painting: 1, "East Asian Traditions": 1, News: 1 });
    expect(Object.fromEntries(countBy(rows, { group: "", source: "library" }, "group"))).toEqual({ Painting: 1, "East Asian Traditions": 1, News: 1 });
  });

  it("counts each source with the group filter kept, ignoring its own axis", () => {
    expect(Object.fromEntries(countBy(rows, { group: "", source: "mine" }, "source"))).toEqual({ mine: 1, profile: 1, library: 3 });
    expect(Object.fromEntries(countBy(rows, { group: NO_GROUP, source: "" }, "source"))).toEqual({ mine: 1, profile: 1 });
  });

  it("filterStyles applies both filters", () => {
    expect(filterStyles(rows, { group: "Painting", source: "" }).map((r) => r.slug)).toEqual(["watercolor"]);
    expect(filterStyles(rows, { group: NO_GROUP, source: "profile" }).map((r) => r.slug)).toEqual(["comic-multiverse"]);
  });
});
