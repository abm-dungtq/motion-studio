// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canDeleteEvent, eventOps, musicForm, musicOps, shotOps, wordFields } from "@/core/inspector-ops.ts";

const m = {
  duration: 20,
  shots: [
    { id: "s1", start: 0, end: 6.5, name: "Mở", motion_note: "" },
    { id: "s2", start: 6.5, end: 12.5, name: "Chữ", transition_in: "", motion_note: "cũ" },
  ],
  events: [{ id: "sfx-whoosh", shot: "s2", offset: -0.2 }, { id: "sfx-1", shot: "s1", offset: 1, studio: true }],
};

describe("shotOps", () => {
  it("sends set_shot for each changed field and resize_shot together", () => {
    const r = shotOps(m, "s2", { name: "Chữ rõ", secs: "7", transition: "inverse-zoom-through", note: "bay vào" });
    expect(r.error).toBeNull();
    expect(r.ops).toEqual([
      { op: "set_shot", id: "s2", field: "name", value: "Chữ rõ" },
      { op: "set_shot", id: "s2", field: "transition_in", value: "inverse-zoom-through" },
      { op: "set_shot", id: "s2", field: "motion_note", value: "bay vào" },
      { op: "resize_shot", id: "s2", duration: 7 },
    ]);
  });
  it("sends nothing when nothing changed, and refuses less than 0.5 s", () => {
    expect(shotOps(m, "s2", { name: "Chữ", secs: "6", transition: "", note: "cũ" })).toEqual({ ops: [], error: null });
    expect(shotOps(m, "s2", { name: "Chữ", secs: "0.3", transition: "", note: "cũ" }).error).toBe("Số giây tối thiểu là 0,5");
  });
});

describe("musicOps", () => {
  const bed = { id: "bgm", start: 0, end: null, media_start: 0, gain: 1, fade_in: 0, fade_out: 0 };
  it("keeps only the changed fields", () => {
    const r = musicOps(bed, { ...musicForm(bed), gain: "60", fadeIn: "1.5" }, 20);
    expect(r).toEqual({ ops: [{ op: "update_music", id: "bgm", gain: 0.6, fade_in: 1.5 }], error: null });
    expect(musicOps(bed, musicForm(bed), 20)).toEqual({ ops: [], error: null });
  });
  it("says what is wrong with a field", () => {
    const f = musicForm(bed);
    expect(musicOps(bed, { ...f, gain: "120" }, 20).error).toBe("Âm lượng trong 0–100%");
    expect(musicOps(bed, { ...f, start: "-1" }, 20).error).toBe("Thời gian không được âm");
    expect(musicOps(bed, { ...f, end: "0.3" }, 20).error).toBe("Kết thúc phải sau bắt đầu ít nhất 0,5 giây và không quá 20.0s");
    expect(musicOps(bed, { ...f, fadeIn: "15", fadeOut: "10" }, 20).error).toBe("Fade vào + fade ra dài hơn khối nhạc");
  });
});

describe("eventOps and canDeleteEvent", () => {
  it("moves an SFX inside the video only", () => {
    expect(eventOps(m, "sfx-whoosh", "99").error).toBe("Thời điểm trong 0–20.0s");
    expect(eventOps(m, "sfx-whoosh", "6.5")).toEqual({ ops: [{ op: "move_event", id: "sfx-whoosh", start: 6.5 }], error: null });
    expect(eventOps(m, "sfx-whoosh", "6.3")).toEqual({ ops: [], error: null });
  });
  it("deletes only SFX added in Studio", () => {
    expect(canDeleteEvent(m.events[0])).toBe(false);
    expect(canDeleteEvent(m.events[1])).toBe(true);
  });
});

describe("wordFields", () => {
  it("keeps the changed ends of a word", () => {
    expect(wordFields({ start: 0, end: 0.2 }, "0.05", "0.2")).toEqual({ fields: { start: 0.05 }, error: null });
    expect(wordFields({ start: 0, end: 0.2 }, "x", "0.2").error).toBe("Nhập số hợp lệ");
  });
});
