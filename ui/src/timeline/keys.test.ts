import "@/shell/test-utils.tsx";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actions, idleTransport, type Transport } from "@/api/actions.ts";
import { queryClient, say } from "@/api/client.ts";
import * as Q from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import { onTimelineKey } from "./keys.ts";

vi.mock("@/api/client.ts", async (orig) => ({ ...(await orig<typeof import("@/api/client.ts")>()), say: vi.fn() }));

let tr: Record<keyof Transport, ReturnType<typeof vi.fn>>;
const fit = vi.fn();
let listener: (e: KeyboardEvent) => void;

beforeEach(() => {
  tr = {
    play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), seek: vi.fn(), step: vi.fn(), time: vi.fn(() => 0), duration: vi.fn(() => 20.6),
    playing: vi.fn(() => false), reload: vi.fn(), timing: vi.fn(() => null), audioIds: vi.fn(() => []), setMute: vi.fn(),
  };
  actions.transport = tr as unknown as Transport;
  queryClient.setQueryData(Q.keys.project("demo"), { version: 1, fps: 30, shots: [], lines: [] });
  useStudio.setState({ name: "demo", pps: 60 });
  listener = (e) => onTimelineKey(e, fit);
  window.addEventListener("keydown", listener);
});
afterEach(() => {
  window.removeEventListener("keydown", listener);
  actions.transport = idleTransport;
  fit.mockClear();
});

const key = (init: KeyboardEventInit, target: Window | Element = window) => fireEvent.keyDown(target, init);

describe("timeline keys", () => {
  it("transport keys of the README table", () => {
    key({ key: " ", code: "Space" });
    expect(tr.toggle).toHaveBeenCalledTimes(1);
    key({ key: "j", code: "KeyJ" }); expect(tr.step).toHaveBeenLastCalledWith(-1);
    key({ key: "k", code: "KeyK" }); expect(tr.pause).toHaveBeenCalledTimes(1);
    key({ key: "l", code: "KeyL" }); expect(tr.play).toHaveBeenCalledTimes(1);
    key({ key: "ArrowLeft" }); expect(tr.step).toHaveBeenLastCalledWith(-1 / 30);
    key({ key: "ArrowRight" }); expect(tr.step).toHaveBeenLastCalledWith(1 / 30);
    key({ key: "ArrowLeft", shiftKey: true }); expect(tr.step).toHaveBeenLastCalledWith(-1);
    key({ key: "ArrowRight", shiftKey: true }); expect(tr.step).toHaveBeenLastCalledWith(1);
    key({ key: "Home" }); expect(tr.seek).toHaveBeenLastCalledWith(0);
    key({ key: "End" }); expect(tr.seek).toHaveBeenLastCalledWith(20.6);
  });

  it("edit keys: S, Delete, Backspace, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y", () => {
    const split = vi.spyOn(actions, "split").mockResolvedValue();
    const del = vi.spyOn(actions, "deletePicked").mockResolvedValue();
    const undo = vi.spyOn(actions, "undo").mockResolvedValue();
    const redo = vi.spyOn(actions, "redo").mockResolvedValue();
    key({ key: "s", code: "KeyS" }); expect(split).toHaveBeenCalledTimes(1);
    key({ key: "Delete" }); key({ key: "Backspace" }); expect(del).toHaveBeenCalledTimes(2);
    key({ key: "z", code: "KeyZ", metaKey: true }); key({ key: "z", code: "KeyZ", ctrlKey: true }); expect(undo).toHaveBeenCalledTimes(2);
    key({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true }); key({ key: "y", code: "KeyY", ctrlKey: true }); expect(redo).toHaveBeenCalledTimes(2);
  });

  it("view keys: N, R, Shift+Z, = and + zoom in, - zooms out", () => {
    key({ key: "n", code: "KeyN" });
    expect(useStudio.getState().snap).toBe(false);
    expect(say).toHaveBeenLastCalledWith("Hít: tắt");
    key({ key: "r", code: "KeyR" });
    expect(useStudio.getState().mode).toBe("roll");
    expect(say).toHaveBeenLastCalledWith("Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên");
    key({ key: "Z", code: "KeyZ", shiftKey: true }); expect(fit).toHaveBeenCalledTimes(1);
    key({ key: "=" }); expect(useStudio.getState().pps).toBe(75);
    key({ key: "+", shiftKey: true }); expect(useStudio.getState().pps).toBe(93.75);
    key({ key: "-" }); expect(useStudio.getState().pps).toBe(75);
  });

  it("nothing fires in a field, under a dialog or a menu, on the tab rail, or with Alt", () => {
    const split = vi.spyOn(actions, "split").mockResolvedValue();
    const area = document.createElement("textarea");
    document.body.append(area);
    key({ key: " ", code: "Space" }, area);
    key({ key: "s", code: "KeyS" }, area);
    key({ key: "Home" }, area);
    key({ key: "s", code: "KeyS", altKey: true });
    const rail = document.createElement("div");
    rail.setAttribute("role", "tablist");
    const tab = document.createElement("button");
    rail.append(tab);
    document.body.append(rail);
    key({ key: "s", code: "KeyS" }, tab);
    for (const role of ["dialog", "menu"]) {
      const d = document.createElement("div");
      d.setAttribute("role", role);
      document.body.append(d);
      key({ key: "s", code: "KeyS" });
      key({ key: " ", code: "Space" });
      d.remove();
    }
    expect(split).not.toHaveBeenCalled();
    expect(tr.toggle).not.toHaveBeenCalled();
    expect(tr.seek).not.toHaveBeenCalled();
    area.remove(); rail.remove();
    key({ key: "s", code: "KeyS" });
    expect(split).toHaveBeenCalledTimes(1);
  });
});
