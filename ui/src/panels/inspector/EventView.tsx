// Port of eventView of public/inspector.js:149-177; behaviour unchanged. A sound effect: label,
// sound and volume shown locked, its time moved with move_event; "Xoá SFX" only for an SFX added
// in Studio, otherwise "Nhờ đạo diễn xoá SFX này".
import { useState } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import type { Manifest, SfxEventFull } from "@/api/types.ts";
import { fmt } from "@/core/format.ts";
import { canDeleteEvent, eventOps } from "@/core/inspector-ops.ts";
import { eventStart } from "@/core/timeline-edit.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button, Input } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { Field, Muted, NumberField, Title } from "./parts.tsx";
import { RetimedNote } from "./RetimedNote.tsx";
import { ShotBody } from "./ShotView.tsx";

function EventForm({ m, e }: { m: Manifest; e: SfxEventFull }) {
  const ro = !m.capabilities?.editable;
  const at = eventStart(m, e);
  const [time, setTime] = useState(String(at));
  const apply = async () => {
    const { ops, error } = eventOps(m, e.id, time);
    if (error) return say(error, true);
    if (!ops.length) return say("Không có gì thay đổi");
    if (await actions.patch(ops)) say("Đã áp dụng");
  };
  const volume = typeof e.volume === "number" ? `${Math.round(e.volume * 100)}%` : "mặc định";
  return (
    <>
      <Title>{`SFX ${e.id} · ${fmt(at)}`}</Title>
      <Field label="Nhãn"><Input value={e.label ?? ""} disabled readOnly /></Field>
      <Field label="File âm thanh"><Input value={e.sound ?? ""} disabled readOnly /></Field>
      <Field label="Thời điểm (giây)"><NumberField step="0.01" min="0" disabled={ro} value={time} onValue={setTime} /></Field>
      <div><Button variant="primary" disabled={ro} onClick={() => { void apply(); }}>Áp dụng</Button></div>
      <Field label="Âm lượng"><Input value={volume} disabled readOnly /></Field>
      <Muted>Âm lượng SFX đổi qua đạo diễn</Muted>
      <div>
        {canDeleteEvent(e)
          ? <Button disabled={ro} onClick={() => { void actions.patch([{ op: "remove_event", id: e.id }]); }}>Xoá SFX</Button>
          : <Button onClick={() => { void actions.directRemoveSfx(e); }}>Nhờ đạo diễn xoá SFX này</Button>}
      </div>
    </>
  );
}

export function EventView({ pick, m }: InspectorSectionProps) {
  const sel = useStudio((s) => s.sel);
  if (!m) return null;
  const e = (m.events ?? []).find((x) => x.id === pick.id);
  return (
    <div className="flex flex-col gap-2.5">
      <RetimedNote />
      {e ? <EventForm key={`${e.id}\n${m.version}`} m={m} e={e} /> : <ShotBody m={m} id={sel} />}
    </div>
  );
}
