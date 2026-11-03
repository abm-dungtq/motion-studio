// The box key C opens on the timeline at the playhead: type a note, Enter pins it there (with the
// shot under the playhead), Escape or leaving the box drops it.
import { useState } from "react";
import { say } from "@/api/client.ts";
import { noteAdd, useProject } from "@/api/queries.ts";
import { shotAt } from "@/core/timeline-edit.ts";
import { useStudio } from "@/store/studio.ts";
import { Input } from "@/shell/controls.tsx";

const LABEL = 90;
const WIDTH = 280;

// 12.4 → "0:12.4".
export const stamp = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function NoteInput({ pps, width }: { pps: number; width: number }) {
  const name = useStudio((s) => s.name);
  const at = useStudio((s) => s.noteAt);
  const { data: m } = useProject(name);
  const [text, setText] = useState("");
  if (at == null || !name) return null;

  const close = () => { setText(""); useStudio.getState().setNoteAt(null); };
  const save = async () => {
    const s = text.trim();
    if (!s) return close();
    close();
    const r = await noteAdd({ name, t: at, text: s, shot: shotAt(m, at)?.id ?? null });
    if (r.status !== 200) say(r.error ?? `Không lưu được ghi chú (lỗi ${r.status})`, true);
  };
  const left = Math.max(0, Math.min(LABEL + at * pps, width - WIDTH));

  return (
    <div data-testid="note-input" className="absolute top-7 z-[6] flex flex-col gap-1 rounded-md border border-border bg-panel p-1.5 shadow-md" style={{ left, width: WIDTH }}>
      <label htmlFor="note-input-text" className="text-xs text-muted-foreground">{`Ghi chú tại ${stamp(at)} · Enter lưu, Esc bỏ`}</label>
      <Input
        id="note-input-text"
        autoFocus
        maxLength={500}
        value={text}
        placeholder="Ví dụ: chữ ra muộn"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void save(); }
          else if (e.key === "Escape") { e.preventDefault(); close(); }
        }}
        onBlur={close}
      />
    </div>
  );
}
