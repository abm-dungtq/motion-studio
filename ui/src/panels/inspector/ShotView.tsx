// Port of shotView of public/inspector.js:46-88 and its focus-note handler (:242); behaviour
// unchanged. Tên, Số giây and Chuyển cảnh vào, applied together with the motion note by
// "Áp dụng" as one patch (set_shot + resize_shot, core/inspector-ops.ts); the motion note sent as a
// shot request at the playhead by "Nhờ đạo diễn"; the shot's assets as thumbnails. On a read-only
// project every field is disabled except the note, which is also the text of "Nhờ đạo diễn".
import { useEffect, useState } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { useDirections } from "@/api/queries.ts";
import type { Manifest } from "@/api/types.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bus } from "@/core/bus.ts";
import { fmtS, round1 } from "@/core/format.ts";
import { shotOps } from "@/core/inspector-ops.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Thumb } from "@/panels/director/Thumb.tsx";
import { Button, Input, Textarea } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { Field, Muted, Title } from "./parts.tsx";
import { RetimedNote } from "./RetimedNote.tsx";

// Radix Select takes no empty value; "(không)" stands for no transition.
const NONE = "__none__";

function ShotForm({ m, index }: { m: Manifest; index: number }) {
  const s = m.shots[index];
  const name = useStudio((st) => st.name) ?? "";
  const ro = !m.capabilities?.editable;
  const { data: directions } = useDirections();
  const seams = (Array.isArray(directions?.seams) ? directions.seams : []).filter((x): x is string => typeof x === "string");
  const cur = s.transition_in ?? "";
  const opts = ["", ...new Set([...seams, cur].filter(Boolean))];
  const [title, setTitle] = useState(s.name ?? "");
  const [secs, setSecs] = useState(String(round1(s.end - s.start)));
  const [trans, setTrans] = useState(cur);
  const [note, setNote] = useState(s.motion_note ?? "");
  const assets = s.assets ?? [];

  const apply = async () => {
    const { ops, error } = shotOps(m, s.id, { name: title, secs, transition: trans, note });
    if (error) return say(error, true);
    if (!ops.length) return say("Không có gì thay đổi");
    if (await actions.patch(ops)) say("Đã áp dụng");
  };

  return (
    <>
      <Title>{`SHOT ${index + 1} · ${fmtS(s.start)}–${fmtS(s.end)}`}</Title>
      <Field label="Tên"><Input value={title} disabled={ro} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Số giây"><Input type="number" step="0.1" min="0.5" value={secs} disabled={ro} onChange={(e) => setSecs(e.target.value)} /></Field>
      <Field label="Chuyển cảnh vào">
        <Select value={trans || NONE} disabled={ro} onValueChange={(v) => setTrans(v === NONE ? "" : v)}>
          <SelectTrigger aria-label="Chuyển cảnh vào" size="sm" className="w-full border-border bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            {opts.map((o) => <SelectItem key={o || NONE} value={o || NONE}>{o || "(không)"}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <div><Button variant="primary" disabled={ro} onClick={() => { void apply(); }}>Áp dụng</Button></div>
      <Title>Chuyển động</Title>
      <Muted>Nội dung chuyển động trong shot này là code — nhờ đạo diễn</Muted>
      <Textarea data-role="motion-note" aria-label="Chuyển động" value={note} placeholder="Muốn shot này chuyển động thế nào…" onChange={(e) => setNote(e.target.value)} />
      <div><Button onClick={() => { void actions.direct({ scope: "shot", target: s.id, t: round1(useStudio.getState().t), text: note.trim() }); }}>Nhờ đạo diễn</Button></div>
      <Title>{`Chất liệu (${assets.length})`}</Title>
      {assets.length ? <div className="flex flex-wrap gap-1.5">{assets.map((a) => <Thumb key={a} name={name} path={a} />)}</div> : <Muted>Chưa có chất liệu</Muted>}
    </>
  );
}

// The shot form of shot id (the selected shot when another view has nothing to show). The form
// starts again from the manifest for each shot and each new version, as the old render did.
export function ShotBody({ m, id }: { m: Manifest; id: string | null }) {
  const index = m.shots.findIndex((s) => s.id === id);
  if (index < 0) return <Muted>Chọn một shot trên timeline</Muted>;
  return <ShotForm key={`${m.shots[index].id}\n${m.version}`} m={m} index={index} />;
}

// The timeline's "Nhờ đạo diễn sửa shot này" picks the shot, then asks for the note: focus it once
// the new shot's form is on screen.
function useFocusNote(): void {
  useEffect(() => bus.on("focus-note", () => {
    const st = useStudio.getState();
    st.setRightTab("shot");
    st.toggleRight(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-slot="right.shot"] [data-role="motion-note"]')?.focus());
  }), []);
}

export function ShotView({ pick, m }: InspectorSectionProps) {
  useFocusNote();
  if (!m) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <RetimedNote />
      <ShotBody m={m} id={pick.id} />
    </div>
  );
}
