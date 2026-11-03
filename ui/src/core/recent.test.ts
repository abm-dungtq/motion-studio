import { beforeEach, describe, expect, it } from "vitest";
import { pushRecent, readRecent, rememberRecent, RECENT_STORE } from "./recent.ts";

describe("pushRecent", () => {
  it("puts the name first and drops its older place", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(pushRecent([], "a")).toEqual(["a"]);
  });

  it("keeps at most 6", () => {
    expect(pushRecent(["a", "b", "c", "d", "e", "f"], "g")).toEqual(["g", "a", "b", "c", "d", "e"]);
    expect(pushRecent(["a", "b", "c"], "d", 2)).toEqual(["d", "a"]);
  });
});

describe("readRecent and rememberRecent", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores newest first and reads back only names", () => {
    rememberRecent("a-02");
    rememberRecent("b");
    rememberRecent("a-02");
    expect(readRecent()).toEqual(["a-02", "b"]);
    window.localStorage.setItem(RECENT_STORE, '["x", 3, "", null]');
    expect(readRecent()).toEqual(["x"]);
    window.localStorage.setItem(RECENT_STORE, "{");
    expect(readRecent()).toEqual([]);
  });
});
