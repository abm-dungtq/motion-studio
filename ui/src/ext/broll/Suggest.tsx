// Port of public/ext-broll.js; behaviour unchanged.
// "Gợi ý B-roll" in the inspector of a shot (ext-broll.js:13-66): the top 5 parts of the indexed
// footage (GET /api/broll/suggest), fetched once per project, shot and version. "Đặt vào shot"
// cuts the part into assets/broll/ and adds it to the shot's assets through the gateway (a new
// version; Cmd+Z takes it back), then, when ticked, asks the director to place the clip in the
// shot's scene.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { actions, current } from "@/api/actions.ts";
import { say } from "@/api/client.ts";
import { brollApply, brollSuggestQuery } from "@/api/queries.ts";
import type { InspectorSectionProps } from "@/ext/registry.ts";
import { Button, Checkbox } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { FormError, HitCard, span, type BrollHit } from "./HitCard.tsx";
import { useBroll } from "./store.ts";

export const APPLY_TIMEOUT_MS = 11 * 60000;

export interface Suggestion extends BrollHit { need_stretch?: boolean; use: { start: number; end: number } }
export interface SuggestAnswer { query: string; duration: number; items: Suggestion[] }

function Place({ name, shot, x, editable }: { name: string; shot: string; x: Suggestion; editable: boolean }) {
  const [busy, setBusy] = useState(false);
  const place = async () => {
    const { m, name: open } = current();
    if (!m || open !== name) return;
    setBusy(true);
    const r = await brollApply({ name, shot, base: m.version, sha256: x.sha256, start: x.use.start, end: x.use.end }, { timeout: APPLY_TIMEOUT_MS });
    setBusy(false);
    if (r.status !== 200) { say(r.error ?? `Lỗi ${r.status}`, true); return; }
    const d = r.data ?? {};
    say(d.unchanged ? `${d.rel} đã có trong shot ${shot}` : `Đã thêm ${d.rel} vào shot ${shot} (v${d.version}); Cmd+Z để hoàn tác`);
    if (useBroll.getState().askDirector && !d.unchanged) {
      await actions.direct({ scope: "shot", target: shot, text: `Đặt clip B-roll ${d.rel} (đã có trong assets của shot ${shot}) vào cảnh của shot này, đúng thời lượng shot.` });
    }
  };
  return (
    <Button variant="primary" className="mt-1 w-fit" disabled={!editable || busy} onClick={() => { void place(); }}>
      {busy ? "Đang cắt…" : "Đặt vào shot"}
    </Button>
  );
}

export function Suggest({ pick, m }: InspectorSectionProps) {
  const name = useStudio((s) => s.name);
  const sel = useStudio((s) => s.sel);
  const askDirector = useBroll((s) => s.askDirector);
  const shot = pick.id ?? sel;
  const base = brollSuggestQuery(name, shot ?? "");
  const { data, error } = useQuery({
    ...base,
    queryKey: [...base.queryKey, m?.version ?? null] as unknown as typeof base.queryKey,
    enabled: Boolean(name && shot && m),
    staleTime: Infinity,
  });
  if (!name || !shot || !m) return null;
  const box = data as SuggestAnswer | undefined;
  const editable = Boolean(m.capabilities?.editable);

  let body;
  if (error) body = <FormError text={error.message} />;
  else if (!box) body = <small className="text-xs text-muted-foreground">Đang tìm…</small>;
  else if (!box.items.length) body = <small className="text-xs text-muted-foreground">{box.query ? `Không có footage khớp "${box.query}". Phân tích thêm footage ở tab Footage.` : "Shot chưa có tên hay lời để tìm."}</small>;
  else body = (
    <>
      <small className="text-xs text-muted-foreground">{`Tìm theo: ${box.query} · shot dài ${box.duration.toFixed(1)} s`}</small>
      <label className="flex items-center gap-1.5 text-[13px]">
        <Checkbox checked={askDirector} onChange={(e) => useBroll.getState().setAskDirector(e.target.checked)} />
        <span>Nhờ đạo diễn đặt clip vào cảnh</span>
      </label>
      {box.items.map((x, i) => (
        <HitCard key={`${x.sha256 ?? x.path}:${x.start}:${i}`} x={x}>
          {x.need_stretch ? <small className="text-xs text-warn">ngắn hơn shot: cần lặp/chậm</small> : <small className="text-xs text-muted-foreground">{`dùng ${span(x.use)}`}</small>}
          <Place name={name} shot={shot} x={x} editable={editable} />
        </HitCard>
      ))}
    </>
  );
  return (
    <div className="grid gap-2 border-t border-border pt-3" data-broll-suggest="">
      <strong className="text-sm">Gợi ý B-roll</strong>
      {body}
    </div>
  );
}
