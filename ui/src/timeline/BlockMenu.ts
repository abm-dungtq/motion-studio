// Port of menuOn and the menus of the blocks and the SFX lane of public/timeline.js (:140-146,
// :208-217, :264, :296-299, :316-319, :462); behaviour unchanged.
// Right click on a block opens its menu at the pointer (shell/PointMenu.tsx: one menu at a time).
import type { MouseEvent } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import type { Manifest, Music, SfxEventFull, Shot } from "@/api/types.ts";
import { bus } from "@/core/bus.ts";
import { rollOps } from "@/core/timeline-edit.ts";
import { round3 } from "@/core/timeline-geometry.ts";
import { openPointMenu, type PointMenuItem } from "@/shell/PointMenu.tsx";

type Item = PointMenuItem | null | false;

function open(e: MouseEvent, items: Item[]): void {
  e.preventDefault();
  e.stopPropagation();
  openPointMenu(e.clientX, e.clientY, items);
}

export function shotMenu(e: MouseEvent, m: Manifest, s: Shot, hasNext: boolean, editable: boolean): void {
  open(e, [
    editable && { label: "Cắt tại playhead (S)", run: () => { actions.select(s.id); void actions.split(); } },
    editable && hasNext && { label: "Roll điểm cắt về playhead", run: () => {
      const r = rollOps(m, s.id, round3(actions.transport.time() - s.end));
      if (r.error) return say(r.error, true);
      if (r.ops.length) void actions.patch(r.ops);
    } },
    { label: "Nhờ đạo diễn sửa shot này", run: () => { actions.pick("shot", s.id); bus.emit("focus-note"); } },
  ]);
}

export function lineMenu(e: MouseEvent, id: string): void {
  open(e, [{ label: "Chọn câu", run: () => actions.pick("line", id) }]);
}

export function musicMenu(e: MouseEvent, mu: Music, editable: boolean): void {
  open(e, editable ? [
    { label: "Đưa về đầu video", run: () => { void actions.patch([{ op: "update_music", id: mu.id, start: 0 }]); }, disabled: mu.start === 0 },
    { label: "Chạy tới hết video", run: () => { void actions.patch([{ op: "update_music", id: mu.id, end: null }]); }, disabled: mu.end == null },
  ] : []);
}

// Only an SFX added in Studio (studio: true) is deleted here; the director's own SFX go through
// the director, since the gateway refuses remove_event on them.
export function sfxMenu(e: MouseEvent, ev: SfxEventFull, editable: boolean): void {
  open(e, [
    ev.studio ? editable && { label: "Xoá SFX", run: () => { void actions.patch([{ op: "remove_event", id: ev.id }]); } }
      : { label: "Nhờ đạo diễn xoá SFX này", run: () => { void actions.directRemoveSfx(ev); } },
  ]);
}

// Empty space of the SFX lane: add an SFX at time t.
export function sfxLaneMenu(e: MouseEvent, t: number, editable: boolean): void {
  open(e, editable ? [{ label: "Thêm SFX tại đây…", run: () => { void actions.addSfx(t); } }] : []);
}
