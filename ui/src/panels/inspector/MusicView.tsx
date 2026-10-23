// Port of musicView of public/inspector.js:103-147; behaviour unchanged. A music bed: start, end,
// head trim, volume and fades → one update_music with only the changed fields
// (core/inspector-ops.ts musicOps).
import { useState } from "react";
import { actions } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import type { Manifest, Music } from "@/api/types.ts";
import { musicForm, musicOps, type MusicForm } from "@/core/inspector-ops.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { Field, Muted, NumberField, Title } from "./parts.tsx";
import { RetimedNote } from "./RetimedNote.tsx";
import { ShotBody } from "./ShotView.tsx";

function MusicFormView({ m, b }: { m: Manifest; b: Music }) {
  const ro = !m.capabilities?.editable;
  const [form, setForm] = useState<MusicForm>(() => musicForm(b));
  const field = (k: keyof MusicForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const apply = async () => {
    const { ops, error } = musicOps(b, form, m.duration || 0);
    if (error) return say(error, true);
    if (!ops.length) return say("Không có gì thay đổi");
    if (await actions.patch(ops)) say("Đã áp dụng");
  };
  const file = String(b.file ?? "");
  return (
    <>
      <Title>{`NHẠC · ${file.split("/").pop()}`}</Title>
      <Muted>{file}</Muted>
      <Field label="Bắt đầu (giây)"><NumberField step="0.1" min="0" disabled={ro} value={form.start} onValue={field("start")} /></Field>
      <Field label="Kết thúc (giây, trống = hết video)"><NumberField step="0.1" min="0" placeholder="hết video" disabled={ro} value={form.end} onValue={field("end")} /></Field>
      <Field label="Cắt đầu (giây)"><NumberField step="0.1" min="0" disabled={ro} value={form.head} onValue={field("head")} /></Field>
      <Field label="Âm lượng (%)"><NumberField step="1" min="0" max="100" disabled={ro} value={form.gain} onValue={field("gain")} /></Field>
      <Field label="Fade vào (giây)"><NumberField step="0.1" min="0" disabled={ro} value={form.fadeIn} onValue={field("fadeIn")} /></Field>
      <Field label="Fade ra (giây)"><NumberField step="0.1" min="0" disabled={ro} value={form.fadeOut} onValue={field("fadeOut")} /></Field>
      <Muted>Fade chỉ nghe trong bản xuất, xem thử chưa có fade</Muted>
      <div><Button variant="primary" disabled={ro} onClick={() => { void apply(); }}>Áp dụng</Button></div>
    </>
  );
}

export function MusicView({ pick, m }: InspectorSectionProps) {
  const sel = useStudio((s) => s.sel);
  if (!m) return null;
  const b = (m.music ?? []).find((x) => x.id === pick.id);
  return (
    <div className="flex flex-col gap-2.5">
      <RetimedNote />
      {b ? <MusicFormView key={`${b.id}\n${m.version}`} m={m} b={b} /> : <ShotBody m={m} id={sel} />}
    </div>
  );
}
