// Port of showTimingUndo of public/app.js (:206-212) and the timing-undo button of
// public/index.html; behaviour unchanged.
// "Hoàn tác mốc": puts back the newest beat or word marker edit (POST /api/timing/undo). Enabled on
// an editable project with at least one backup; it says how many are left.
import { useMarkers } from "@/api/markers.ts";
import { Button } from "@/shell/controls.tsx";

export function TimingUndo({ editable }: { editable: boolean }) {
  const markers = useMarkers();
  // GET /api/timing also answers how many marker backups there are (routes/timing.mjs).
  const n = Number((markers.get() as { undo?: unknown } | null)?.undo) || 0;
  return (
    <Button
      data-testid="timing-undo"
      disabled={!editable || !(n > 0)}
      title={n > 0 ? `Trả lại lần sửa mốc gần nhất (còn ${n})` : "Chưa sửa mốc phách hay mốc từ nào"}
      onClick={() => { void markers.undo(); }}
    >
      {n > 0 ? `Hoàn tác mốc (${n})` : "Hoàn tác mốc"}
    </Button>
  );
}
