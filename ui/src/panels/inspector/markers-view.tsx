// Port of the marker helpers of public/inspector.js:179-183 (gone, busyNote, undoBtn) and the
// extra fields of GET /api/timing the views read (lib/timing-edit.mjs readMarkers: file,
// original, undo, busy); behaviour unchanged.
import type { Markers, TimingData, TimingGrid, TimingLine } from "@/core/markers.ts";
import { Button } from "@/shell/controls.tsx";
import { Muted, Note, Title } from "./parts.tsx";

export interface GridFull extends TimingGrid { file: string; original: number }
export interface LineFull extends TimingLine { file?: string; original?: { start: number; end: number }[] | null }
export interface TimingFull extends TimingData { undo?: number; busy?: string | null }

export function Gone({ what }: { what: string }) {
  return <><Title>{what}</Title><Muted>Mốc này không còn (file đã đổi). Chọn lại trên timeline.</Muted></>;
}

export function BusyNote({ d }: { d: TimingFull | null }) {
  return d?.busy ? <Note>{`Chưa sửa được: ${d.busy}`}</Note> : null;
}

export function UndoButton({ d, mk }: { d: TimingFull | null; mk: Markers }) {
  const n = Number(d?.undo) || 0;
  return <div><Button disabled={!mk.editable() || !(n > 0)} onClick={() => { void mk.undo(); }}>{`Hoàn tác mốc${n > 0 ? ` (${n})` : ""}`}</Button></div>;
}
