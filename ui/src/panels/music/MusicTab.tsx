// Port of public/panels.js; behaviour unchanged.
// The "Nhạc & âm thanh" tab (panels.js music(), :212-229): a volume slider per background music
// track and the sound effects placed on shots. The percentage follows the thumb while it moves;
// the patch goes out once, when the thumb is released (the old "change" event).
import { useEffect, useState } from "react";
import { actions } from "@/api/actions.ts";
import { useProject } from "@/api/queries.ts";
import type { Music, SfxEventFull } from "@/api/types.ts";
import { Slider } from "@/components/ui/slider";
import { fmtS } from "@/core/format.ts";
import { Empty, NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";

const CARD = "flex flex-col gap-2 rounded-md border border-border bg-panel-2 p-2.5";
const base = (path: string): string => path.split("/").pop() ?? path;
const pctOf = (gain: unknown): number => Math.round((Number(gain) || 0) * 100);

function Track({ mu, editable, version }: { mu: Music; editable: boolean; version: number }) {
  const file = String(mu.file ?? "");
  const saved = pctOf(mu.gain);
  const [value, setValue] = useState(saved);
  // A new manifest puts the thumb on the saved gain; so does a refused patch (below).
  useEffect(() => setValue(saved), [saved, version]);
  return (
    <div className={CARD}>
      <strong className="text-sm">{base(file)}</strong>
      <div className="flex items-center gap-3">
        <Slider
          aria-label={`Âm lượng ${file}`}
          min={0}
          max={100}
          step={1}
          value={[value]}
          disabled={!editable}
          onValueChange={([v]) => setValue(v ?? 0)}
          onValueCommit={([v]) => void actions.patch([{ op: "set_music", id: mu.id, field: "gain", value: (v ?? 0) / 100 }]).then((ok) => { if (!ok) setValue(saved); })}
        />
        <span className="w-10 shrink-0 text-right text-sm tabular-nums">{`${value}%`}</span>
      </div>
    </div>
  );
}

function SfxCard({ ev }: { ev: SfxEventFull }) {
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <strong className="text-sm">{ev.label || ev.id}</strong>
        <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground tabular-nums">{`${ev.shot} + ${fmtS(Number(ev.offset) || 0)}`}</span>
      </div>
      {ev.sound ? <span className="text-sm text-muted-foreground">{base(ev.sound)}</span> : null}
    </div>
  );
}

export function MusicTab() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  if (!m) return <NeedManifest />;
  const editable = Boolean(m.capabilities?.editable);
  const music = m.music ?? [];
  const events = m.events ?? [];
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-xs font-semibold text-muted-foreground uppercase">Nhạc nền</h3>
        {music.length
          ? music.map((mu) => <Track key={mu.id} mu={mu} editable={editable} version={m.version} />)
          : <Empty text="Chưa có nhạc nền. Giao việc cho AI chọn nhạc hợp nội dung." action="Giao việc cho AI" to="ai" />}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-xs font-semibold text-muted-foreground uppercase">Hiệu ứng âm thanh</h3>
        {events.length
          ? events.map((ev) => <SfxCard key={ev.id} ev={ev} />)
          : <p className="m-0 p-3 text-sm text-muted-foreground">Chưa có hiệu ứng âm thanh nào gắn theo shot. Giao việc cho AI nếu cần tiếng nhấn.</p>}
      </section>
    </>
  );
}
