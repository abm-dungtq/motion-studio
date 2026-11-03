// What the Anime tab registers at page open: its lead line and the rail badge hook that follows
// the jobs. Kept apart from AnimeTab.tsx so the tab itself loads only when it opens (ext/lazy.ts).
import { say } from "@/api/client.ts";
import { useStudio } from "@/store/studio.ts";
import { reload } from "./store.ts";
import { useFollow } from "./useJob.ts";

export const LEAD = "Motion comic: nhân vật, shot board, biến thể tư thế và hoạt hình lật ảnh";

// The end of each followed job, whatever sub-tab is open (the onEnd of the old A.follow calls).
// It runs from the rail badge of the tab (below), which renders whether the tab is open or not,
// so the end toast shows as soon as the job ends, as in the old UI, even with another tab open.
function useJobEnds(name: string | null): void {
  useFollow("variant", (j) => {
    const line = [...(j.log ?? [])].reverse().find((l) => l.startsWith("RESULT "));
    let out: { ok?: boolean; file?: string; width?: number; color?: string; error?: string } | null = null;
    try { out = line ? JSON.parse(line.slice(7)) : null; } catch { /* shown in the log */ }
    say(out?.ok ? `Đã có ${String(out.file).split("/").pop()} (${out.width}px, nền ${out.color})` : `Không sinh được: ${out?.error ?? `exit ${j.job.code}`}`, !out?.ok);
    void reload(name, "board");
  });
  useFollow("sheet", (j, ref) => {
    say(j.job.code === 0 ? `Đã có sheet của ${ref.label}` : `Không sinh được sheet (exit ${j.job.code})`, j.job.code !== 0);
    void reload(name, "chars", "board");
  });
  useFollow("build", () => { void reload(name, "board"); });
}

// The tab's badge: follows the jobs and never shows a count.
export function useJobEndsBadge(): number {
  useJobEnds(useStudio((s) => s.name));
  return 0;
}
