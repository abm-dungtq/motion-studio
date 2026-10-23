// Port of the timeline bar of public/index.html (:44-53) and zoomBy, fit, toggleSnap, showMode,
// toggleMode of public/timeline.js (:51-73); behaviour unchanged.
// The 36 px bar over the tracks: the key hint, Ripple/Roll, Hoàn tác mốc, Hít, −, +, Vừa khung.
import { memo } from "react";
import { say } from "@/api/client.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { TimingUndo } from "./TimingUndo.tsx";

// The key hint of the old timeline bar (public/index.html:46).
export const TIMELINE_HINT = "Kéo khối để dời · kéo mép để cắt · Shift+kéo câu dời cả câu sau · kéo phách/chấm từ để sửa mốc · R Ripple/Roll · S cắt shot · Space phát/dừng · N hít · Ctrl/Cmd+cuộn zoom";

export const ZOOM_STEP = 1.25;
export const zoomBy = (f: number): void => { const s = useStudio.getState(); s.setPps(s.pps * f); };

export function toggleSnap(): void {
  const s = useStudio.getState();
  s.setSnap(!s.snap);
  say(`Hít: ${!s.snap ? "bật" : "tắt"}`);
}

export function toggleMode(): void {
  const s = useStudio.getState();
  const mode = s.mode === "roll" ? "ripple" : "roll";
  s.setMode(mode);
  say(mode === "roll" ? "Roll: kéo mép shot dời điểm cắt, tổng thời lượng giữ nguyên" : "Ripple: kéo mép shot đổi độ dài, các shot sau dời theo");
}

export const Toolbar = memo(function Toolbar({ editable, onFit }: { editable: boolean; onFit: () => void }) {
  const snap = useStudio((s) => s.snap);
  const mode = useStudio((s) => s.mode);
  return (
    <div className="timeline-bar flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3">
      <span className="hint min-w-0 flex-1 truncate text-xs text-muted-foreground">{TIMELINE_HINT}</span>
      <Button
        data-testid="mode-btn"
        data-mode={mode}
        aria-pressed={mode === "roll"}
        title="Kéo mép shot: Ripple đổi độ dài và dời các shot sau, Roll dời điểm cắt giữ tổng thời lượng (R)"
        className="aria-pressed:border-primary aria-pressed:text-primary"
        onClick={toggleMode}
      >
        {mode === "roll" ? "Roll" : "Ripple"}
      </Button>
      <TimingUndo editable={editable} />
      <Button
        data-testid="snap-btn"
        aria-pressed={snap}
        title="Hít vào mép shot, câu, SFX, playhead, phách, đầu từ (N)"
        className="aria-pressed:border-primary aria-pressed:text-primary"
        onClick={toggleSnap}
      >
        Hít
      </Button>
      <Button variant="icon" aria-label="Thu nhỏ" onClick={() => zoomBy(1 / ZOOM_STEP)}>−</Button>
      <Button variant="icon" aria-label="Phóng to" onClick={() => zoomBy(ZOOM_STEP)}>+</Button>
      <Button title="Cả video vừa khung (Shift+Z)" onClick={onFit}>Vừa khung</Button>
    </div>
  );
});
