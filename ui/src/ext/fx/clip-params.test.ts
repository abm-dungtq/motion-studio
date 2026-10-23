// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Job } from "@/api/types.ts";
import { defaultForm, outcomeOf, paramsOf, parsePoints } from "./clip-params.ts";

const job = (status: string, tail: string[]): Job => ({ id: "j1", name: "p", kind: "fx", status, code: status === "done" ? 0 : 1, started: "2026-10-23T00:00:00Z", tail });

describe("clip params", () => {
  it("parses points and says which part is wrong", () => {
    expect(parsePoints("0:1, 2:2", ["t", "rate"])).toEqual([{ t: 0, rate: 1 }, { t: 2, rate: 2 }]);
    expect(() => parsePoints("abc", ["t", "rate"])).toThrow('"abc" phải có dạng t:rate');
    expect(() => parsePoints(" ", ["t", "rate"])).toThrow("cần ít nhất một điểm t:rate");
  });

  it("builds the params of each operation", () => {
    const f = defaultForm("footage/raw/1.mp4");
    expect(paramsOf({ ...f, in: "0", out: "1" })).toEqual({ in: 0, out: 1 });
    expect(paramsOf({ ...f, op: "freeze" })).toEqual({ at: 1, duration: 1 });
    expect(paramsOf({ ...f, op: "grade", look: "preset:warm", intensity: "0.5" })).toEqual({ preset: "warm", intensity: 0.5 });
    expect(paramsOf({ ...f, op: "grade" })).toEqual({ lut: "identity", intensity: 1 });
    expect(paramsOf({ ...f, op: "reframe" })).toEqual({ aspect: "9:16", anchors: [{ t: 0, x: 0.5, y: 0.5 }] });
    expect(() => paramsOf({ ...f, out: "" })).toThrow("Đến giây phải là số");
  });

  it("reads the RESULT line of a finished job, or why it failed", () => {
    expect(outcomeOf(job("done", ["x", 'RESULT {"ok":true,"rel":"footage/cut/1-trim.mp4"}']), ["x", 'RESULT {"ok":true,"rel":"footage/cut/1-trim.mp4"}']).result?.rel).toBe("footage/cut/1-trim.mp4");
    expect(outcomeOf(job("failed", []), ['RESULT {"ok":false,"error":"lỗi thử render"}']).error).toBe("lỗi thử render");
    expect(outcomeOf(job("failed", []), ["a", "b", "c"]).error).toBe("job failed: b | c");
  });
});
