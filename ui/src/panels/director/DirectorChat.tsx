// Port of public/panels.js:114-130 (views.ai) and the scroll handling of draw() (:541-548);
// behaviour unchanged. The director tab: the storyboard, the chat (requests grouped into threads
// by follows, the last 12 threads), "Đạo diễn đang làm…" and the box for a new task.
// Requests and jobs pass through usePressGate, so the chat never changes under a press. The chat
// follows its end, except when a live gate card is drawn again: then that card stays where the
// user sees it.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useJobs, useProject, useRequests } from "@/api/queries.ts";
import type { DirectorRequest, Job } from "@/api/types.ts";
import { NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { Composer } from "./Composer.tsx";
import { Storyboard } from "./Storyboard.tsx";
import { SHOWN_THREADS, threadsOf } from "./threads.ts";
import { Turn } from "./Turn.tsx";
import { usePressGate } from "./usePressGate.ts";
import { Working } from "./Working.tsx";

const NONE: never[] = [];
const viewport = (el: HTMLElement | null): HTMLElement | null => el?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;
const liveCard = (el: HTMLElement | null): HTMLElement | null => el?.querySelector<HTMLElement>('[data-gate="live"], [data-gate="again"]') ?? null;

export function DirectorChat() {
  const name = useStudio((s) => s.name);
  const rightTab = useStudio((s) => s.rightTab);
  const { data: m } = useProject(name);
  const { data: requests = NONE as DirectorRequest[] } = useRequests(name);
  const { data: jobs = NONE as Job[] } = useJobs(name);
  const root = useRef<HTMLDivElement>(null);
  const live = useMemo(() => ({ requests, jobs }), [requests, jobs]);
  const shown = usePressGate(live, root);
  const threads = useMemo(() => threadsOf(shown.requests).slice(-SHOWN_THREADS), [shown.requests]);
  const anchor = useRef<{ el: HTMLElement; top: number } | null>(null);
  const following = useRef(true);
  const ready = Boolean(name && m);
  const toEnd = (vp: HTMLElement) => { following.current = true; vp.scrollTop = vp.scrollHeight; };

  // After each redraw: keep a live card in place, or follow the end of the chat.
  useLayoutEffect(() => {
    const vp = viewport(root.current);
    if (!vp) return;
    const before = anchor.current;
    if (before?.el.isConnected) vp.scrollTop += before.el.getBoundingClientRect().top - before.top;
    else toEnd(vp);
    const el = liveCard(root.current);
    anchor.current = el ? { el, top: el.getBoundingClientRect().top } : null;
  }, [threads, shown.jobs, ready]);

  // The user scrolling moves the card too; remember where it is now, and whether the chat still
  // follows its end. While it does, content that grows later (the panel settling, a picture
  // loading) keeps the end in view.
  useEffect(() => {
    const vp = viewport(root.current);
    const el = root.current;
    if (!vp || !el) return;
    const onScroll = () => {
      if (anchor.current) anchor.current.top = anchor.current.el.getBoundingClientRect().top;
      following.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 8;
    };
    const ro = new ResizeObserver(() => { if (following.current && !anchor.current) vp.scrollTop = vp.scrollHeight; });
    vp.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    return () => { vp.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, []);

  // Opening the director tab shows the end of the chat.
  useEffect(() => {
    if (rightTab !== "director") return;
    const vp = viewport(root.current);
    if (vp && !anchor.current) toEnd(vp);
  }, [rightTab]);

  return (
    <div ref={root} data-role="director" className="flex flex-col gap-3">
      {!ready || !name ? <NeedManifest /> : (
        <>
          <Storyboard name={name} />
          <div data-role="chat" aria-live="polite" className="flex flex-col gap-2">
            {threads.length
              ? threads.flatMap((t) => t.map((r, i) => <Turn key={r.id} name={name} r={r} joined={i > 0} />))
              : <p className="m-0 text-sm text-muted-foreground">Chưa giao việc nào. Viết việc đầu tiên ở ô dưới rồi bấm Giao việc.</p>}
          </div>
          <Working name={name} jobs={shown.jobs} requests={shown.requests} />
          <Composer />
        </>
      )}
    </div>
  );
}
