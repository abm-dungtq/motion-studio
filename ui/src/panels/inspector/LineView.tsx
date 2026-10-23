// Port of lineView of public/inspector.js:89-101; behaviour unchanged. A voice line: its text and
// time; the text is edited in the "Lời & giọng" tab (the viet-pro gate is there).
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { fmtS } from "@/core/format.ts";
import { Button } from "@/shell/controls.tsx";
import { goTo } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { Note, Title } from "./parts.tsx";
import { RetimedNote } from "./RetimedNote.tsx";
import { ShotBody } from "./ShotView.tsx";

export function LineView({ pick, m }: InspectorSectionProps) {
  const sel = useStudio((s) => s.sel);
  if (!m) return null;
  const l = m.lines.find((x) => x.id === pick.id);
  return (
    <div className="flex flex-col gap-2.5">
      <RetimedNote />
      {!l ? <ShotBody m={m} id={sel} /> : (
        <>
          <Title>{`CÂU ${l.id} · ${fmtS(l.start)}–${fmtS(l.start + (Number(l.duration) || 0))}`}</Title>
          <div data-role="quote" className="rounded-sm border-l-4 border-track-voice bg-track-voice/15 px-2.5 py-2 text-sm whitespace-pre-wrap">{l.text}</div>
          {l.gate === "stale" ? <Note>Lời đã sửa, cần qua cổng viet-pro và lồng tiếng lại</Note> : null}
          <div><Button onClick={() => goTo("voice")}>Sửa lời ở tab Lời & giọng</Button></div>
        </>
      )}
    </div>
  );
}
