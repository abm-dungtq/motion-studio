import { describe, expect, it } from "vitest";
import type { Job } from "@/api/types.ts";
import type { VgItem } from "@/ext/videogen/api.ts";
import { jobLabel, jobStatus, mss, trayItems } from "./job-tray.ts";

const NOW = Date.parse("2026-11-03T10:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const job = (o: Partial<Job>): Job => ({ id: "j", name: "p", kind: "export", status: "running", code: null, started: ago(30), ...o });
const flow = (o: Partial<VgItem>): VgItem => ({
  id: "v", shot: "s3", state: "running", charge: null, error: null, files: [], prompt_head: "", created: ago(20), updated: ago(5), version: null, ...o,
});

describe("jobStatus", () => {
  it("maps the named statuses", () => {
    expect(jobStatus({ status: "running", code: null })).toBe("running");
    expect(jobStatus({ status: "cancelling", code: null })).toBe("running");
    expect(jobStatus({ status: "done", code: 0 })).toBe("done");
    expect(jobStatus({ status: "failed", code: 1 })).toBe("failed");
    expect(jobStatus({ status: "cancelled", code: null })).toBe("cancelled");
  });
  it("falls back to the exit code for any other status", () => {
    expect(jobStatus({ status: "exited", code: null })).toBe("running");
    expect(jobStatus({ status: "exited", code: 0 })).toBe("done");
    expect(jobStatus({ status: "exited", code: 2 })).toBe("failed");
  });
});

describe("jobLabel", () => {
  it("names each kind and the export step", () => {
    expect(jobLabel({ kind: "export" })).toBe("Xuất video");
    expect(jobLabel({ kind: "export", meta: { step: "render" } })).toBe("Xuất video · đang render");
    expect(jobLabel({ kind: "export", meta: { step: "compress" } })).toBe("Xuất video · đang nén");
    expect(jobLabel({ kind: "export", meta: { step: "bundle" } })).toBe("Xuất video · đang gói bộ lớp dựng");
    expect(jobLabel({ kind: "timing" })).toBe("Ghi mốc thời gian");
    expect(jobLabel({ kind: "word-sync" })).toBe("Khớp chữ");
    expect(jobLabel({ kind: "director" })).toBe("Đạo diễn đang làm");
    expect(jobLabel({ kind: "demo", meta: { request: "r1" } })).toBe("Đạo diễn đang làm");
    expect(jobLabel({ kind: "lint" })).toBe("lint");
  });
});

describe("trayItems", () => {
  it("labels Flow runs by kind and says what phase they reached", () => {
    const rows = trayItems([], [
      flow({ id: "a", phase: "spawned", created: ago(30) }),
      flow({ id: "b", phase: "typed", kind: "image", shot: "s1", created: ago(20) }),
      flow({ id: "c", phase: "sent", created: ago(10) }),
    ], NOW);
    expect(rows.map((r) => [r.label, r.detail])).toEqual([
      ["Tạo clip bằng Flow · Shot s3", "Đã gửi, đã tính lượt"],
      ["Tạo ảnh bằng Flow · Shot s1", "Đã điền prompt"],
      ["Tạo clip bằng Flow · Shot s3", "Đang mở Flow"],
    ]);
    expect(rows.every((r) => r.status === "running" && r.cancel)).toBe(true);
  });

  it("maps Flow states", () => {
    const st = (state: VgItem["state"]) => trayItems([], [flow({ state })], NOW)[0].status;
    expect(st("intent")).toBe("running");
    expect(["made", "attached", "collected"].map((s) => st(s as VgItem["state"]))).toEqual(["done", "done", "done"]);
    expect(st("failed")).toBe("failed");
    expect(st("indeterminate")).toBe("failed");
    expect(st("cancelled")).toBe("cancelled");
  });

  it("keeps running rows and rows ended in the last 10 minutes, newest first", () => {
    const rows = trayItems([
      job({ id: "old", status: "done", code: 0, started: ago(3600), ended: ago(700) }),
      job({ id: "recent", status: "failed", code: 1, started: ago(900), ended: ago(500) }),
      job({ id: "long", status: "running", started: ago(7200) }),
      job({ id: "new", kind: "timing", status: "running", started: ago(5) }),
    ], [flow({ id: "gone", state: "attached", created: ago(2000), updated: ago(1000) })], NOW);
    expect(rows.map((r) => r.id)).toEqual(["job:new", "job:recent", "job:long"]);
    expect(rows[1].elapsed).toBe(400_000);
    expect(rows[2].elapsed).toBe(7_200_000);
  });

  it("offers no cancel on a job already cancelling", () => {
    expect(trayItems([job({ status: "cancelling" })], [], NOW)[0].cancel).toBeUndefined();
  });
});

describe("mss", () => {
  it("formats minutes and seconds", () => {
    expect(mss(75_000)).toBe("1:15");
    expect(mss(4_900)).toBe("0:04");
  });
});
