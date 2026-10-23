// Port of beatView of public/inspector.js:185-199; behaviour unchanged. The beat grid of the music
// bed (shared markers, useMarkers): beat0 now and before Studio first moved it, a field to set it,
// "Về gốc" and "Hoàn tác mốc".
import { useState } from "react";
import { useMarkers } from "@/api/markers.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button } from "@/shell/controls.tsx";
import { Field, Kv, Muted, NumberField, t3, Title } from "./parts.tsx";
import { BusyNote, Gone, UndoButton, type GridFull, type TimingFull } from "./markers-view.tsx";
import { RetimedNote } from "./RetimedNote.tsx";

function BeatForm({ g, d }: { g: GridFull; d: TimingFull }) {
  const mk = useMarkers();
  const ro = !mk.editable();
  const [beat0, setBeat0] = useState(String(g.beat0));
  const bpm = g.beatLen > 0 ? Math.round((60 / g.beatLen) * 10) / 10 : null;
  return (
    <>
      <Title>{`MỐC PHÁCH · ${g.file.split("/").pop()}`}</Title>
      <Muted>{`${g.file}${bpm ? ` · ${bpm} BPM · một phách ${t3(g.beatLen)}` : ""}`}</Muted>
      <Field label="Phách đầu (beat0, giây)">
        <NumberField step="0.001" min="0" max={String(Math.max(0, g.beatLen - 0.001))} disabled={ro} value={beat0} onValue={setBeat0} />
      </Field>
      <Kv k="Giờ gốc" v={t3(g.original)} />
      <BusyNote d={d} />
      <div className="flex gap-2">
        <Button variant="primary" disabled={ro} onClick={() => { void mk.setBeat(Number(beat0)); }}>Áp dụng</Button>
        <Button disabled={ro || Math.abs(g.original - g.beat0) < 1e-6} onClick={() => { void mk.setBeat(g.original); }}>Về gốc</Button>
      </div>
      <UndoButton d={d} mk={mk} />
      <Muted>Kéo một vạch phách trên thước để dời cả lưới. B(n) trong cảnh dời theo sau khi dựng lại TIMING.</Muted>
    </>
  );
}

export function BeatView({ pick, m }: InspectorSectionProps) {
  const mk = useMarkers();
  if (!m) return null;
  const d = mk.get() as TimingFull | null;
  const g = d?.grid as GridFull | null | undefined;
  return (
    <div className="flex flex-col gap-2.5">
      <RetimedNote />
      {!d || !g || g.music_id !== pick.id ? <Gone what="MỐC PHÁCH" /> : <BeatForm key={`${g.sha}\n${g.beat0}`} g={g} d={d} />}
    </div>
  );
}
