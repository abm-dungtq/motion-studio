import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateForJob } from "./job-invalidate.ts";
import { keys } from "./queries.ts";
import type { Job } from "./types.ts";

const job = (kind: string): Job => ({ id: "j-1", name: "p", kind, status: "exited", code: 0, started: "2026-11-03T00:00:00Z" } as Job);
const invalidated = (type: "start" | "log" | "exit", kind: string) => {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
  invalidateForJob(qc, "p", { type, job: job(kind) });
  return spy.mock.calls.map(([f]) => (f as { queryKey: unknown }).queryKey);
};

describe("invalidateForJob", () => {
  it("a broll exit reloads the broll job, plan and search, and the job list", () => {
    expect(invalidated("exit", "broll")).toEqual([keys.jobs("p"), keys.brollJob(), keys.brollPlan(), keys.brollSearch()]);
  });

  it("an unknown kind reloads the job list only", () => {
    expect(invalidated("exit", "something-new")).toEqual([keys.jobs("p")]);
    expect(invalidated("start", "something-new")).toEqual([keys.jobs("p")]);
  });

  it("a log line reloads nothing", () => {
    expect(invalidated("log", "broll")).toEqual([]);
  });

  it("the gates follow the exit of a kind that changes their inputs, not its start", () => {
    expect(invalidated("exit", "timing")).toEqual([keys.jobs("p"), keys.gates("p")]);
    expect(invalidated("start", "timing")).toEqual([keys.jobs("p")]);
    expect(invalidated("exit", "broll")).not.toContainEqual(keys.gates("p"));
  });
});
