import { describe, expect, it } from "vitest";
import { changeText, manifestDiff, parsePair, type ManifestLike } from "./manifest-diff.ts";

const base: ManifestLike = {
  shots: [
    { id: "s1", start: 0, end: 2, name: "Mở" },
    { id: "s2", start: 2, end: 4, name: "Giữa" },
    { id: "s3", start: 4, end: 6, name: "Đòn" },
  ],
  lines: [{ id: "vo-01", text: "Xin chào" }, { id: "vo-02", text: "Tạm biệt" }],
  music: [{ id: "bgm", file: "a.mp3", start: 0, end: 6, gain: 0.2 }],
};

describe("manifestDiff", () => {
  it("adds a shot, lengthens one, changes a line: three changes, shots before lines", () => {
    const after: ManifestLike = {
      ...base,
      shots: [
        { id: "s1", start: 0, end: 2, name: "Mở" },
        { id: "s2", start: 2, end: 5.5, name: "Giữa" },
        { id: "s3", start: 5.5, end: 7.5, name: "Đòn" },
        { id: "s4", start: 7.5, end: 9, name: "Kết" },
      ],
      lines: [{ id: "vo-01", text: "Xin chào cả nhà" }, { id: "vo-02", text: "Tạm biệt" }],
    };
    expect(manifestDiff(base, after)).toEqual([
      { kind: "shot-changed", shot: "s2", index: 1, fields: [{ field: "dur", before: 2, after: 3.5 }] },
      { kind: "shot-added", shot: "s4", index: 3 },
      { kind: "line-changed", line: "vo-01", before: "Xin chào", after: "Xin chào cả nhà" },
    ]);
  });

  it("tells a removed shot where it was, renamed or re-sourced shots, lines added and removed, and the music", () => {
    const after: ManifestLike = {
      shots: [{ id: "s1", start: 0, end: 2, name: "Mở đầu", assets: ["a.png"] }, { id: "s3", start: 2, end: 4, name: "Đòn" }],
      lines: [{ id: "vo-02", text: "Tạm biệt" }, { id: "vo-03", text: "Mới" }],
      music: [{ id: "bgm", file: "a.mp3", start: 0, end: 6, gain: 0.3 }, { id: "bgm-2", file: "b.mp3" }],
    };
    expect(manifestDiff(base, after)).toEqual([
      { kind: "shot-changed", shot: "s1", index: 0, fields: [{ field: "name", before: "Mở", after: "Mở đầu" }, { field: "assets", before: undefined, after: ["a.png"] }] },
      { kind: "shot-removed", shot: "s2", index: 1 },
      { kind: "line-added", line: "vo-03", text: "Mới" },
      { kind: "line-removed", line: "vo-01", text: "Xin chào" },
      { kind: "music-changed", fields: ["bgm: gain", "bgm-2: thêm"] },
    ]);
  });

  it("finds nothing when only the version, the update time or the shot starts moved", () => {
    expect(manifestDiff({ ...base, version: 1 } as ManifestLike, { ...base, version: 2, updated: "x" } as ManifestLike)).toEqual([]);
  });

  it("parsePair reads both sides and gives null for a missing or broken one", () => {
    expect(parsePair('{"shots":[]}', '{"shots":[]}')).toEqual([{ shots: [] }, { shots: [] }]);
    expect(parsePair(null, "{}")).toBeNull();
    expect(parsePair("{", "{}")).toBeNull();
  });

  it("tells each change in one sentence", () => {
    expect(changeText({ kind: "shot-changed", shot: "s3", index: 2, fields: [{ field: "dur", before: 2, after: 3.5 }, { field: "transition_in", before: "", after: "ink-wipe" }] })).toBe("Shot 3 dài 2,0 s → 3,5 s; đổi chuyển cảnh không có → ink-wipe");
    expect(changeText({ kind: "shot-added", shot: "s7", index: 6 })).toBe("Thêm shot 7");
    expect(changeText({ kind: "shot-removed", shot: "s2", index: 1 })).toBe("Bỏ shot 2 của bản cũ (s2)");
    expect(changeText({ kind: "line-changed", line: "vo-04", before: "a", after: "b" })).toBe("Câu vo-04: “a” → “b”");
    expect(changeText({ kind: "line-added", line: "vo-05", text: "x".repeat(80) })).toBe(`Thêm câu vo-05: “${"x".repeat(59)}…”`);
    expect(changeText({ kind: "music-changed", fields: ["bgm: gain"] })).toBe("Nhạc: bgm: gain");
  });
});
