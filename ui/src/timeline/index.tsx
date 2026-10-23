// Port of mountTimeline / render of public/timeline.js (:39-479); behaviour unchanged.
// The timeline row of the shell: the bar (Toolbar), then a box that scrolls both ways with the
// ruler, five tracks (Shot, B-roll, Lồng tiếng, Nhạc, SFX), the playhead and the snap line. The
// label column (LABEL px) sticks to the left. Blocks are memoised React elements placed at
// xAt(t, pps); they render again when the manifest, the zoom, the edit mode or the pick changes,
// never while the playhead moves (Playhead writes its own transform). The first view of a project
// fits the whole video in the width; Ctrl/Cmd+wheel zooms around the pointer.
// Shortcuts (keys.ts) live here too: the shell has no other key handler.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { actions } from "@/api/actions.ts";
import { useProject, useTimelineMedia } from "@/api/queries.ts";
import type { Manifest } from "@/api/types.ts";
import { bus } from "@/core/bus.ts";
import { wordStarts, type DecoItem, type DecoLane } from "@/core/timeline-edit.ts";
import { fitPps, LABEL, round3, TAIL, timelineTotal, trackLayout, zoomAround, type LaneKind } from "@/core/timeline-geometry.ts";
import { sfxTiers } from "@/core/timeline-lanes.ts";
import { useDecorators } from "@/ext/registry.ts";
import { cn } from "@/lib/utils";
import { NeedManifest } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { sfxLaneMenu } from "./BlockMenu.ts";
import { Decorations, decoByLane } from "./Decorations.tsx";
import { useTimelineKeys } from "./keys.ts";
import { GROUPS, MuteSolo } from "./MuteSolo.tsx";
import { Playhead } from "./Playhead.tsx";
import { Ruler } from "./Ruler.tsx";
import { ShotNote } from "./ShotThumb.tsx";
import { compositionTiming, useSnapLine } from "./snap.ts";
import { Toolbar } from "./Toolbar.tsx";
import { BrollTrack } from "./tracks/BrollTrack.tsx";
import { MusicTrack } from "./tracks/MusicTrack.tsx";
import { ShotTrack } from "./tracks/ShotTrack.tsx";
import { SfxTrack } from "./tracks/SfxTrack.tsx";
import { VoiceTrack } from "./tracks/VoiceTrack.tsx";
import { ViewContext, type TimelineView } from "./view.ts";

export { TIMELINE_HINT } from "./Toolbar.tsx";

// The composition's TIMING (beats, word starts), read again whenever the player has a new one.
function useCompositionTiming() {
  const [timing, setTiming] = useState(compositionTiming);
  useEffect(() => bus.on("timing", () => setTiming(compositionTiming())), []);
  return timing;
}

interface TrackRowProps {
  label: string; lane: LaneKind; height: number; width: number; extra?: ReactNode; deco?: DecoItem[]; pps: number; total: number;
  menu?: (e: MouseEvent, t: number) => void; children: ReactNode;
}

// One track: a sticky label (with M/S on audio tracks) and its lane. Empty lane space seeks on a
// click and opens the lane's menu on a right click.
function TrackRow({ label, lane, height, width, extra, deco, pps, total, menu, children }: TrackRowProps) {
  const timeAt = (el: HTMLElement, x: number) => Math.max(0, Math.min(total, (x - el.getBoundingClientRect().left) / pps));
  const group = GROUPS[label];
  return (
    <div className={cn("tl-track flex border-b border-border", `t-${lane}`)} style={{ width, height }} data-track={lane}>
      <div className={cn("tl-label sticky left-0 z-[2] flex w-[90px] flex-none border-r border-border bg-panel px-3 text-xs font-semibold text-foreground", group || extra ? "flex-col items-start justify-center gap-0.5" : "items-center")}>
        <span>{label}</span>
        {group ? <MuteSolo group={group} name={label} /> : null}
        {extra}
      </div>
      <div
        className="tl-lane relative flex-1"
        data-testid={`lane-${lane}`}
        onClick={(e) => { if (e.target === e.currentTarget) actions.seek(timeAt(e.currentTarget, e.clientX)); }}
        onContextMenu={menu ? (e) => { if (e.target === e.currentTarget) menu(e, round3(timeAt(e.currentTarget, e.clientX))); } : undefined}
      >
        {deco?.length ? <Decorations items={deco} pps={pps} /> : null}
        {children}
      </div>
    </div>
  );
}

const EMPTY_DECO: Record<DecoLane, DecoItem[]> = { shot: [], voice: [], music: [], sfx: [] };

function Tracks({ m, name, scroller }: { m: Manifest; name: string; scroller: RefObject<HTMLDivElement | null> }) {
  const pps = useStudio((s) => s.pps);
  const mode = useStudio((s) => s.mode);
  const sel = useStudio((s) => s.sel);
  const pick = useStudio((s) => s.pick);
  const editable = Boolean(m.capabilities?.editable);
  const { data: media } = useTimelineMedia(name);
  const timing = useCompositionTiming();
  const decorators = useDecorators();
  const inner = useRef<HTMLDivElement>(null);
  const snap = useSnapLine();
  const view = useMemo<TimelineView>(() => ({ inner, snapLine: snap.line }), [snap.line]);

  const total = timelineTotal(m);
  const lane = total * pps + TAIL;
  const width = LABEL + lane;
  const tracks = trackLayout(m, pps);
  const h = (k: LaneKind) => tracks.find((t) => t.lane === k)!.h;
  const words = useMemo(() => wordStarts(timing), [timing]);
  const deco = useMemo(() => (decorators.length ? decoByLane(decorators, m, { name, sel, pick }) : EMPTY_DECO), [decorators, m, name, sel, pick]);
  const pickOf = (k: string) => (pick?.kind === k ? pick.id : null);
  const render = media?.render ?? undefined;
  const files = media?.files;
  const mediaReady = Boolean(media);

  // The first view of a project fits the video in the width (render() of the old timeline).
  const fitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (fitted.current === name || !(total > 0) || !el || !(el.clientWidth > 0)) return;
    fitted.current = name;
    useStudio.getState().setPps(fitPps(el.clientWidth, total));
  }, [name, total, scroller]);

  return (
    <ViewContext.Provider value={view}>
      <div ref={inner} data-testid="timeline-inner" className={cn("tl-inner relative min-h-full", !editable && "readonly")} style={{ width }}>
        <Ruler pps={pps} total={total} lane={lane} beatPicked={pick?.kind === "beat"} timing={timing} />
        <TrackRow label="Shot" lane="shot" height={h("shot")} width={width} pps={pps} total={total} deco={deco.shot} extra={<ShotNote render={render} />}>
          <ShotTrack m={m} pps={pps} mode={mode} sel={sel} editable={editable} name={name} render={render} />
        </TrackRow>
        <TrackRow label="B-roll" lane="broll" height={h("broll")} width={width} pps={pps} total={total}>
          <BrollTrack m={m} pps={pps} editable={editable} name={name} stamps={files} />
        </TrackRow>
        <TrackRow label="Lồng tiếng" lane="voice" height={h("voice")} width={width} pps={pps} total={total} deco={deco.voice}>
          <VoiceTrack m={m} pps={pps} pickLine={pickOf("line")} wordPick={pickOf("word")} editable={editable} name={name} files={files} mediaReady={mediaReady} words={words} />
        </TrackRow>
        <TrackRow label="Nhạc" lane="music" height={h("music")} width={width} pps={pps} total={total} deco={deco.music}>
          <MusicTrack m={m} total={total} pps={pps} pick={pickOf("music")} editable={editable} name={name} files={files} mediaReady={mediaReady} />
        </TrackRow>
        <SfxRow m={m} pps={pps} total={total} width={width} height={h("sfx")} deco={deco.sfx} pick={pickOf("event")} editable={editable} />
        <Playhead total={total} />
        <div ref={snap.ref} data-testid="snap-line" className="snap-line pointer-events-none absolute top-0 bottom-0 z-[5] -ml-px w-0.5 bg-primary" hidden />
      </div>
    </ViewContext.Provider>
  );
}

function SfxRow({ m, pps, total, width, height, deco, pick, editable }: { m: Manifest; pps: number; total: number; width: number; height: number; deco: DecoItem[]; pick: string | null; editable: boolean }) {
  return (
    <TrackRow
      label="SFX" lane="sfx" height={height} width={width} pps={pps} total={total} deco={deco}
      menu={(e, t) => sfxLaneMenu(e, t, editable)}
      extra={<SfxOverflow m={m} pps={pps} />}
    >
      <SfxTrack m={m} pps={pps} pick={pick} editable={editable} />
    </TrackRow>
  );
}

// More than 4 SFX on top of each other: the last tier holds the rest.
function SfxOverflow({ m, pps }: { m: Manifest; pps: number }) {
  if (!sfxTiers(m, pps).overflow) return null;
  return <span className="tl-note stale block text-[10px] font-medium whitespace-nowrap text-warn" title="Hơn 4 SFX chồng nhau; tầng cuối gộp phần còn lại, phóng to để tách">+ gộp</span>;
}

export function TimelineArea() {
  const name = useStudio((s) => s.name);
  const { data: m } = useProject(name);
  const scroller = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(null);
  const pps = useStudio((s) => s.pps);

  const fit = useCallback(() => {
    const el = scroller.current;
    const total = timelineTotal(m);
    if (!(total > 0) || !el || !(el.clientWidth > 0)) return;
    useStudio.getState().setPps(fitPps(el.clientWidth, total));
    pendingScroll.current = 0;
    el.scrollLeft = 0;
  }, [m]);
  useTimelineKeys(fit);

  // A zoom that asked for a scroll position gets it once the wider lanes are in.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pendingScroll.current != null) { el.scrollLeft = pendingScroll.current; pendingScroll.current = null; }
  }, [pps]);

  // Ctrl/Cmd+wheel zooms; the time under the pointer stays under it. Not passive: it must stop
  // the page zoom.
  const hasManifest = Boolean(m);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !hasManifest) return;
      e.preventDefault();
      const s = useStudio.getState();
      const r = zoomAround({ pps: s.pps, factor: e.deltaY < 0 ? 1.15 : 1 / 1.15, pointerX: e.clientX - el.getBoundingClientRect().left, scrollLeft: el.scrollLeft });
      if (r.pps === s.pps) return;
      pendingScroll.current = r.scrollLeft;
      s.setPps(r.pps);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasManifest]);

  return (
    <div data-testid="timeline-area" className="flex flex-col bg-panel">
      <Toolbar editable={Boolean(m?.capabilities?.editable)} onFit={fit} />
      <div ref={scroller} data-testid="timeline-scroll" className="timeline relative max-h-[calc(45vh-2.25rem-1px)] overflow-auto">
        {m && name ? <Tracks m={m} name={name} scroller={scroller} /> : (
          <div>
            <p className="m-0 px-3 pt-3 text-sm text-muted-foreground">Chưa có timeline</p>
            <NeedManifest />
          </div>
        )}
      </div>
    </div>
  );
}
