// Port of wordView of public/inspector.js:201-230; behaviour unchanged. One word of a line's
// words.json (shared markers, useMarkers): where it sits on the video, its start and end in the
// voice file, the original times, "Về gốc", "Hoàn tác mốc" and "Kiểm khớp lời".
import { useState } from "react";
import { say } from "@/api/client.ts";
import { useMarkers } from "@/api/markers.ts";
import { wordFields } from "@/core/inspector-ops.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button } from "@/shell/controls.tsx";
import { Field, Kv, Muted, NumberField, t3, Title } from "./parts.tsx";
import { BusyNote, Gone, UndoButton, type LineFull, type TimingFull } from "./markers-view.tsx";
import { RetimedNote } from "./RetimedNote.tsx";

function WordForm({ lineId, i, l, d }: { lineId: string; i: number; l: LineFull; d: TimingFull | null }) {
  const mk = useMarkers();
  const ro = !mk.editable();
  const w = l.words[i];
  const o = l.original?.[i] ?? { start: w.start, end: w.end };
  const [start, setStart] = useState(String(w.start));
  const [end, setEnd] = useState(String(w.end));
  const apply = () => {
    const { fields, error } = wordFields(w, start, end);
    if (error) return say(error, true);
    if (!Object.keys(fields).length) return say("Không có gì thay đổi");
    void mk.setWord(lineId, i, fields);
  };
  const same = Math.abs(o.start - w.start) < 1e-6 && Math.abs(o.end - w.end) < 1e-6;
  return (
    <>
      <Title>{`MỐC TỪ · "${w.text}"`}</Title>
      <Muted>{`${lineId} · từ #${i + 1}/${l.words.length} · ${l.file ?? ""}`}</Muted>
      <Kv k="Trên video" v={`${t3(l.offset + w.start)} – ${t3(l.offset + w.end)}`} />
      <Field label="Đầu từ (giây trong file giọng)"><NumberField step="0.001" min="0" disabled={ro} value={start} onValue={setStart} /></Field>
      <Field label="Cuối từ (giây trong file giọng)"><NumberField step="0.001" min="0" disabled={ro} value={end} onValue={setEnd} /></Field>
      <Kv k="Giờ gốc" v={`${t3(o.start)} – ${t3(o.end)}`} />
      <BusyNote d={d} />
      <div className="flex gap-2">
        <Button variant="primary" disabled={ro} onClick={apply}>Áp dụng</Button>
        <Button disabled={ro || same} onClick={() => { void mk.setWord(lineId, i, { start: o.start, end: o.end }); }}>Về gốc</Button>
      </div>
      <UndoButton d={d} mk={mk} />
      <div><Button onClick={() => { void mk.wordSync(); }}>Kiểm khớp lời</Button></div>
      <Muted>Chữ chốt bám lời (W()) dời theo. Sau khi sửa, bấm Kiểm khớp lời để xem chữ còn khớp giọng không.</Muted>
    </>
  );
}

export function WordView({ pick, m }: InspectorSectionProps) {
  const mk = useMarkers();
  if (!m) return null;
  const [lineId, k] = String(pick.id).split("#");
  const i = Number(k);
  const d = mk.get() as TimingFull | null;
  const l = mk.line(lineId) as LineFull | null;
  const w = l?.words?.[i];
  return (
    <div className="flex flex-col gap-2.5">
      <RetimedNote />
      {!l || !w ? <Gone what="MỐC TỪ" /> : <WordForm key={`${l.sha}\n${i}\n${w.start}\n${w.end}`} lineId={lineId} i={i} l={l} d={d} />}
    </div>
  );
}
