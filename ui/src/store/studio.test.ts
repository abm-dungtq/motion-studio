import { afterEach, describe, expect, it } from "vitest";
import { clampPps, requestedTab, selFor, TAB_STORE, useStudio } from "./studio.ts";

const m = {
  shots: [{ id: "s1", start: 0, end: 4 }, { id: "s2", start: 4, end: 8 }],
  lines: [{ id: "l1", shot: "s2", start: 4.5, end: 6 }],
  events: [{ id: "e1", t: 1 }],
};

afterEach(() => {
  useStudio.setState(useStudio.getInitialState(), true);
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("studio store", () => {
  it("starts with the old defaults", () => {
    const s = useStudio.getState();
    expect(s).toMatchObject({ name: null, pick: null, sel: null, snap: true, mode: "ripple", pps: 60, rightTab: "director", dialog: null, retimed: false, directorDraft: "" });
    expect(s.audio).toEqual({ mute: [], solo: [] });
  });

  it("clamps the zoom to 8..400 px a second", () => {
    expect(clampPps(1)).toBe(8);
    expect(clampPps(1000)).toBe(400);
    expect(clampPps(Number.NaN)).toBe(60);
    useStudio.getState().setPps(500);
    expect(useStudio.getState().pps).toBe(400);
  });

  it("setPick shows the block in the Shot tab and moves sel to its shot", () => {
    useStudio.getState().setPick("line", "l1", m);
    expect(useStudio.getState()).toMatchObject({ pick: { kind: "line", id: "l1" }, sel: "s2", rightTab: "shot" });
    useStudio.getState().setPick("shot", "s1", m);
    expect(useStudio.getState().sel).toBe("s1");
  });

  it("music keeps the selected shot", () => {
    expect(selFor("music", "bgm", m, "s1")).toBe("s1");
  });

  it("setLeftTab keeps the tab in localStorage and ?tab=", () => {
    useStudio.getState().setLeftTab("voice");
    expect(window.localStorage.getItem(TAB_STORE)).toBe("voice");
    expect(new URL(window.location.href).searchParams.get("tab")).toBe("voice");
    expect(requestedTab()).toBe("voice");
  });

  it("requestedTab ignores ai and output, which are not left tabs", () => {
    window.history.replaceState(null, "", "/?tab=ai");
    expect(requestedTab()).toBe("");
    window.localStorage.setItem(TAB_STORE, "output");
    expect(requestedTab()).toBe("");
  });

  it("toggles collapse flags and audio mute/solo groups", () => {
    const s = useStudio.getState();
    s.toggleLeft();
    expect(useStudio.getState().leftCollapsed).toBe(true);
    s.toggleLeft(true);
    expect(useStudio.getState().leftCollapsed).toBe(false);
    s.toggleRight(false);
    expect(useStudio.getState().rightCollapsed).toBe(true);
    s.toggleAudio("mute", "music");
    s.toggleAudio("solo", "voice");
    expect(useStudio.getState().audio).toEqual({ mute: ["music"], solo: ["voice"] });
    s.toggleAudio("mute", "music");
    expect(useStudio.getState().audio.mute).toEqual([]);
  });
});
