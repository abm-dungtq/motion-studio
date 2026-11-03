import { describe, expect, it } from "vitest";
import type { Job } from "@/api/types.ts";
import { anyRunning, cardsInterval, IDLE_MS, POLL_MS, previewsInterval } from "./api.ts";

describe("previewsInterval", () => {
  it("stops asking once the project is in no series", () => {
    expect(previewsInterval(null)).toBe(false);
  });
  it("keeps asking while previews may come, or before the first answer", () => {
    expect(previewsInterval({ roles: [] } as never)).toBe(POLL_MS);
    expect(previewsInterval(undefined)).toBe(POLL_MS);
    expect(previewsInterval(undefined, 30000)).toBe(30000);
    expect(previewsInterval(null, 30000)).toBe(false);
  });
});

describe("cardsInterval", () => {
  it("asks every 2 s while a card waits or a job runs, every 30 s otherwise", () => {
    expect(cardsInterval(true, false)).toBe(POLL_MS);
    expect(cardsInterval(false, true)).toBe(POLL_MS);
    expect(cardsInterval(false, false)).toBe(IDLE_MS);
    expect(cardsInterval(false, true, 30000)).toBe(30000);
    expect(cardsInterval(true, true, 30000)).toBe(POLL_MS);
    expect(IDLE_MS).toBe(30000);
  });
  it("counts a job as running by its status or, without one, a missing exit code", () => {
    const job = (o: Partial<Job>): Job => ({ id: "j", name: "p", kind: "timing", status: "done", code: 0, started: "", ...o });
    expect(anyRunning(undefined)).toBe(false);
    expect(anyRunning([job({})])).toBe(false);
    expect(anyRunning([job({}), job({ status: "running", code: null })])).toBe(true);
    expect(anyRunning([job({ status: "exited", code: null })])).toBe(true);
  });
});
