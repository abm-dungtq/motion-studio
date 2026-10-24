// The scenes of an episode, one group at a time (GET /api/scenes, routes/scenes.mjs): each scene
// with its label and span, "Dựng lại cảnh này" (POST /api/scenes/rebuild: the draft clip and the
// stills sheet of that scene only, never the whole film), the stills, a player for the clip and a
// box to tick once the clip was built for the scene's current span. "Duyệt các cảnh đã chọn" is the
// user's approval (POST /api/scenes/approve); the director has no tool for it. Polled while a
// scene is being built. Shown in the director column and the Tài sản tab; nothing when the
// manifest has no scenes.
import { useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, queryClient, say, send } from "@/api/client.ts";
import type { Job } from "@/api/types.ts";
import { Button, Checkbox } from "@/shell/controls.tsx";
import { useStudio } from "@/store/studio.ts";
import { POLL_MS, projectSrc } from "./api.ts";

export interface SceneApproval { by: string; at: string; label: string; line: string }
export interface SceneItem {
  id: string;
  label: string;
  from: number | null;
  to: number | null;
  shots: string[];
  built: string | null;
  clip: string | null;
  stills: string | null;
  current: boolean;
  approved: SceneApproval | null;
  approved_current: boolean;
}
export interface ScenesList { scenes: SceneItem[]; job: Job | null; can_rebuild: boolean }

const enc = encodeURIComponent;
export const scenesKey = (name: string | null) => ["/api/scenes", name] as const;
const scenesQuery = (name: string | null) => queryOptions({
  queryKey: scenesKey(name),
  queryFn: () => api<ScenesList>(`/api/scenes?name=${enc(name ?? "")}`),
});

const sec = (t: number | null): string => (t == null ? "?" : `${Number(t.toFixed(1))}s`);
export const spanText = (s: Pick<SceneItem, "from" | "to">): string => `${sec(s.from)}–${sec(s.to)}`;

export function stateText(s: SceneItem): string {
  if (!s.clip) return "Chưa dựng";
  if (!s.current) return "Mốc cảnh đã đổi sau lần dựng cuối: dựng lại rồi duyệt";
  if (s.approved_current) return `Đã duyệt ${s.approved?.at.slice(0, 16).replace("T", " ") ?? ""}`.trim();
  if (s.approved) return "Đã dựng lại sau lần duyệt trước: xem rồi duyệt lại";
  return "Chờ duyệt";
}

function SceneRow({ name, s, busy, can, picked, onPick, onRebuild }: {
  name: string; s: SceneItem; busy: boolean; can: boolean; picked: boolean;
  onPick: (on: boolean) => void; onRebuild: () => void;
}) {
  const title = `${s.id} · ${s.label}`;
  return (
    <li aria-label={`Cảnh ${s.id}`} className="flex flex-col gap-1.5 rounded border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        {s.current ? <Checkbox checked={picked} aria-label={`Chọn ${s.id} để duyệt`} onChange={(e) => onPick(e.currentTarget.checked)} /> : null}
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{spanText(s)}</span>
        <span className="flex-1" />
        {can ? <Button disabled={busy} aria-label={`Dựng lại ${s.id}`} onClick={onRebuild}>Dựng lại cảnh này</Button> : null}
      </div>
      <p className="m-0 text-xs text-muted-foreground">{stateText(s)}</p>
      {s.stills ? <img src={projectSrc(name, s.stills, s.built ?? undefined)} alt={`Sáu khung của ${s.id}`} className="w-full rounded" loading="lazy" /> : null}
      {s.clip ? <video controls muted preload="none" src={projectSrc(name, s.clip, s.built ?? undefined)} aria-label={`Clip nháp ${s.id}`} className="w-full rounded" /> : null}
    </li>
  );
}

export function ScenesList({ name }: { name: string }) {
  const q = useQuery({ ...scenesQuery(name), refetchInterval: (x) => (x.state.data?.job ? POLL_MS : false) });
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const data = q.data;
  if (!data?.scenes.length) return null;
  const job = data.job;
  const running = job?.meta?.scene as string | undefined;
  const can = data.can_rebuild;
  const ready = new Set(data.scenes.filter((s) => s.current).map((s) => s.id));
  const chosen = picked.filter((id) => ready.has(id));
  const reload = () => queryClient.invalidateQueries({ queryKey: scenesKey(name) });

  async function rebuild(id: string) {
    setSending(true);
    const r = await send("/api/scenes/rebuild", { name, scene: id });
    setSending(false);
    if (r.status !== 200) { say(r.error ?? `Không dựng lại được ${id}`, true); return; }
    say(`Đang dựng lại ${id}. Clip nháp hiện ra ở đây khi xong.`);
    await reload();
  }

  async function approve() {
    setSending(true);
    const r = await send("/api/scenes/approve", { name, scenes: chosen });
    setSending(false);
    if (r.status !== 200) { say(r.error ?? "Không duyệt được các cảnh đã chọn", true); return; }
    say(`Đã duyệt ${chosen.join(", ")}`);
    setPicked([]);
    await reload();
  }

  return (
    <section aria-label="Nhóm cảnh" className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h3 className="m-0 text-sm font-semibold">Nhóm cảnh</h3>
      <p className="m-0 text-xs text-muted-foreground">
        {can ? "Dựng lại từng cảnh rồi xem clip nháp (không tiếng). Duyệt các cảnh đã xem; không cần render cả tập." : "Dự án này chưa dựng lại cảnh được: series chưa khai báo công cụ scene-preview."}
      </p>
      {job ? <p className="m-0 text-xs text-warn">{`Đang dựng ${running ?? "một cảnh"}…${job.tail?.length ? ` ${job.tail.at(-1)}` : ""}`}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {data.scenes.map((s) => (
          <SceneRow
            key={s.id} name={name} s={s} can={can} busy={sending || Boolean(job)}
            picked={chosen.includes(s.id)}
            onPick={(on) => setPicked((p) => (on ? [...p.filter((x) => x !== s.id), s.id] : p.filter((x) => x !== s.id)))}
            onRebuild={() => void rebuild(s.id)}
          />
        ))}
      </ul>
      <Button variant="primary" disabled={sending || !chosen.length} onClick={() => void approve()}>Duyệt các cảnh đã chọn</Button>
    </section>
  );
}

// For a section host: the open project's scenes.
export function ScenesCard() {
  const name = useStudio((s) => s.name);
  return name ? <ScenesList key={name} name={name} /> : null;
}
