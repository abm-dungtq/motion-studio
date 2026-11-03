// The job tray in the top bar: a chip "Đang chạy N" (or "Việc") that opens the project's long jobs
// and Flow runs with the time they ran, a cancel for the running ones and Flow's count for today.
// Open state lives in the studio store so other places (the command palette) can open it.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { say, type SendResult } from "@/api/client.ts";
import { FALLBACK_POLL_MS, useEventsLive } from "@/api/job-invalidate.ts";
import { jobsCancel, useJobs } from "@/api/queries.ts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mss, trayItems, type TrayItem, type TrayStatus } from "@/core/job-tray.ts";
import { hhmm, kindOf, stopText, useVgStatus, vgCancel, vgItems, type VgItem, type VgStatus } from "@/ext/videogen/api.ts";
import { cn } from "@/lib/utils";
import { useStudio } from "@/store/studio.ts";
import { makeConfirm } from "./confirm.tsx";
import { Button } from "./controls.tsx";

const { ask, ConfirmHost } = makeConfirm();

const WORD: Record<TrayStatus, string> = { running: "đang chạy", done: "xong", failed: "lỗi", cancelled: "đã huỷ" };
const fail = (r: SendResult) => { if (r.status !== 200) say(r.error ?? `lỗi ${r.status}`, true); };

// "Flow hôm nay: 19/20 clip · 3/30 ảnh · sắp hết lượt", and the WAF block when there is one.
export function CostLine({ st, now }: { st: VgStatus; now: number }) {
  const low = st.cap - st.today <= 2 || st.image_cap - st.images_today <= 2;
  const blocked = st.waf_until && Date.parse(st.waf_until) > now ? st.waf_until : null;
  return (
    <div className={cn("border-t border-border pt-1.5 text-xs", low ? "text-warn" : "text-muted-foreground")} data-testid="tray-cost">
      {`Flow hôm nay: ${st.today}/${st.cap} clip · ${st.images_today}/${st.image_cap} ảnh${low ? " · sắp hết lượt" : ""}`}
      {blocked ? <div className="text-warn">{`Flow tạm chặn tới ${hhmm(blocked)}`}</div> : null}
    </div>
  );
}

export function JobTray() {
  const name = useStudio((s) => s.name);
  const open = useStudio((s) => s.trayOpen);
  const { data: jobs } = useJobs(name);
  const { data: st } = useVgStatus();
  const busy = Boolean(st?.job && st.job.name === name);
  const live = useEventsLive(name);
  const vgq = useQuery({
    queryKey: ["videogen", "items", name],
    queryFn: () => vgItems(name ?? ""),
    enabled: Boolean(name),
    refetchInterval: busy ? (live ? FALLBACK_POLL_MS : 2000) : false,
  });
  const vg = vgq.data?.items ?? [];
  const [now, setNow] = useState(() => Date.now());
  const items = trayItems(jobs ?? [], vg, now);
  const running = items.filter((x) => x.status === "running").length;

  // One clock for the elapsed times, only while someone can see them change.
  const ticking = open || running > 0;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  // Say when a run ends. Exports are said already by the job events (api/events.ts).
  const seen = useRef<{ name: string | null; was: Map<string, TrayStatus> }>({ name, was: new Map() });
  const sig = items.map((x) => `${x.id}:${x.status}`).join(",");
  useEffect(() => {
    const prev = seen.current.name === name ? seen.current.was : new Map<string, TrayStatus>();
    for (const x of items) {
      if (prev.get(x.id) === "running" && (x.status === "done" || x.status === "failed") && x.kind !== "export") {
        say(`${x.label}: ${WORD[x.status]}`, x.status === "failed");
      }
    }
    seen.current = { name, was: new Map(items.map((x) => [x.id, x.status])) };
    // items is derived from sig; the clock alone changes nothing here.
  }, [sig, name]);

  if (!name) return null;

  const cancel = async (x: TrayItem) => {
    if (x.source === "job") { fail(await jobsCancel({ name, id: x.id.slice(4) })); return; }
    const it: VgItem | undefined = vg.find((v) => `flow:${v.id}` === x.id);
    let phase = it?.phase;
    try { phase = (await vgItems(name)).items.find((v) => v.id === it?.id)?.phase ?? phase; } catch { /* keep the polled phase */ }
    const image = it ? kindOf(it) === "image" : false;
    // The question replaces the tray, so only one dialog is open.
    useStudio.getState().setTrayOpen(false);
    if (await ask(stopText(image, phase), { ok: phase === "sent" ? "Ngừng chờ" : "Huỷ lượt", cancel: "Để chạy tiếp", danger: true })) fail(await vgCancel(name));
  };

  return (
    <>
      <Popover open={open} onOpenChange={(o) => useStudio.getState().setTrayOpen(o)}>
        <PopoverTrigger asChild>
          <Button aria-haspopup="dialog" aria-expanded={open} data-testid="tray-chip" className={cn(running > 0 && "text-primary-ink")}>
            {running > 0 ? `Đang chạy ${running}` : "Việc"}
          </Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Việc của dự án" align="end" collisionPadding={8} className="flex w-[min(380px,92vw)] flex-col gap-1.5">
          {items.length ? (
            <ul className="m-0 flex max-h-[min(360px,60vh)] list-none flex-col gap-1 overflow-y-auto p-0">
              {items.map((x) => (
                <li key={x.id} className="flex items-start gap-2 rounded-sm px-1 py-1 text-sm" data-testid="tray-row">
                  <div className="min-w-0 flex-1">
                    <div className="truncate" title={x.label}>{x.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {[x.detail, mss(x.elapsed), WORD[x.status]].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {x.cancel ? <Button aria-label={`Huỷ ${x.label}`} onClick={() => { void cancel(x); }}>Huỷ</Button> : null}
                  {x.kind === "export" && x.status === "done" ? (
                    <Button onClick={() => { useStudio.getState().setTrayOpen(false); useStudio.getState().openDialog("export"); }}>Mở hộp Xuất</Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="m-0 text-sm text-muted-foreground">Không có việc nào đang chạy hay vừa xong.</p>}
          {st ? <CostLine st={st} now={now} /> : null}
        </PopoverContent>
      </Popover>
      <ConfirmHost />
    </>
  );
}
