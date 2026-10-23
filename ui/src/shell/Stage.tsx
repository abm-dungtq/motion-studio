// The black stage: the composition player (core/player.ts) fitted to the box, the transport under
// it (to start, play/pause, to end, clock), and a poster while the player has no composition to
// show: a frame of the newest render (GET /api/timeline/media) at the playhead, or one line of text.
// The clock is written straight into its element from useStudio.subscribe: playing never renders
// the React tree. Stage sets actions.transport while mounted.
import { useEffect, useRef, useState } from "react";
import { Pause, PanelRightOpen, Play, SkipBack, SkipForward } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { actions, idleTransport } from "@/api/actions.ts";
import { useProject, useProjectEntry, useTimelineMedia } from "@/api/queries.ts";
import { bus } from "@/core/bus.ts";
import { fmt } from "@/core/format.ts";
import { mountPlayer, type Player, type PlayerState } from "@/core/player.ts";
import { thumbAt } from "@/core/thumbs.ts";
import { fileUrl, when } from "@/core/ui-format.ts";
import { useStudio } from "@/store/studio.ts";
import { Button } from "./controls.tsx";

export function Stage() {
  const box = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const player = useRef<Player | null>(null);
  const [status, setStatus] = useState<{ state: PlayerState; message: string | null }>({ state: "empty", message: "Chọn một dự án" });
  const [poster, setPoster] = useState<string | null>(null);

  const name = useStudio((s) => s.name);
  const playing = useStudio((s) => s.playing);
  const audio = useStudio((s) => s.audio);
  const rightCollapsed = useStudio((s) => s.rightCollapsed);
  const providerOk = useStudio((s) => s.providerStatus?.ok !== false);
  const entry = useProjectEntry(name);
  const { data: m } = useProject(name);
  const { data: media } = useTimelineMedia(name);
  const render = media?.render ?? null;

  // The player lives as long as the stage; its DOM is the box, outside React.
  useEffect(() => {
    if (!box.current) return;
    const p = mountPlayer(box.current, {
      onTime: (t) => useStudio.getState().setT(t),
      onState: (on) => useStudio.getState().setPlaying(on),
      onTiming: () => bus.emit("timing"),
      onStatus: setStatus,
    });
    player.current = p;
    actions.transport = {
      play: p.play, pause: p.pause, toggle: p.toggle, seek: p.seek, step: p.step, time: p.time,
      duration: p.duration, playing: p.playing, reload: p.reload, timing: p.timing, audioIds: p.audioIds, setMute: p.setMute,
    };
    return () => {
      p.destroy();
      player.current = null;
      if (actions.transport.reload === p.reload) actions.transport = idleTransport;
    };
  }, []);

  // What the player shows follows the project (app.js open() and the player's "manifest" handler).
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (!providerOk) p.clear("Chưa có provider: xem hướng dẫn phía trên");
    else if (!name) p.clear("Chọn một dự án");
    else if (entry && !entry.has_manifest) p.clear("Nhập dự án để xem");
    else if (m) p.show(name, m);
    else p.clear("");
  }, [providerOk, name, entry, m]);

  useEffect(() => { player.current?.setMute(audio); }, [audio, m]);

  // The clock, outside React renders.
  useEffect(() => {
    const paint = (t: number) => {
      if (clock.current) clock.current.textContent = `${fmt(t)} / ${fmt(actions.transport.duration())}`;
    };
    paint(useStudio.getState().t);
    return useStudio.subscribe((s, prev) => { if (s.t !== prev.t) paint(s.t); });
  }, [m]);

  // The poster: a frame of the newest render at the playhead, while no composition is showing.
  const ready = status.state === "ready";
  const renderPath = render?.path ?? null, renderMtime = render?.mtime ?? 0;
  useEffect(() => {
    if (ready || !name || !renderPath) { setPoster(null); return; }
    let alive = true;
    thumbAt(fileUrl(name, renderPath), renderMtime, useStudio.getState().t)
      .then((url) => { if (alive) setPoster(url); })
      .catch(() => { if (alive) setPoster(null); });
    return () => { alive = false; };
  }, [ready, name, renderPath, renderMtime]);

  const transport = actions.transport;
  const ratio = m?.width && m?.height ? m.width / m.height : 16 / 9;
  const showPoster = !ready && poster && render;
  const message = !ready && !showPoster ? status.message : null;

  return (
    <div data-slot="stage" className="relative flex h-full min-h-0 flex-col bg-background">
      {/* The frame keeps the composition's ratio (16:9 until a manifest says otherwise) and is
          centred: as wide as the box allows, unless that would make it taller than the box. */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 @container-[size]">
        <div
          className="relative overflow-hidden rounded-md border border-border bg-stage"
          style={{ aspectRatio: `${ratio}`, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
        >
          <div ref={box} data-player="" className="absolute inset-0" />
          {showPoster ? (
            <div className="absolute inset-0 flex items-center justify-center bg-stage">
              <img src={poster} alt="" className="h-full w-full object-contain" />
              <span className="absolute bottom-2 left-2 rounded bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {`từ bản render ${when(new Date(render.mtime).toISOString())}`}
              </span>
            </div>
          ) : null}
          {message ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">{message}</div>
          ) : null}
          {status.state === "failed" && showPoster ? (
            <div className="absolute inset-x-0 top-2 text-center text-xs text-muted-foreground">{status.message}</div>
          ) : null}
        </div>
      </div>
      <div className="flex h-12 shrink-0 items-center justify-center gap-2">
        <Button variant="icon" aria-label="Về đầu" onClick={() => transport.seek(0)}><SkipBack /></Button>
        <button
          type="button"
          data-transport="toggle"
          aria-label={playing ? "Dừng" : "Phát"}
          onClick={() => actions.transport.toggle()}
          className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <Button variant="icon" aria-label="Tới cuối" onClick={() => actions.transport.seek(actions.transport.duration())}><SkipForward /></Button>
        <span ref={clock} data-testid="clock" className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">0:00.0 / 0:00.0</span>
      </div>
      {rightCollapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="icon" aria-label="Mở cột phải" className="absolute top-1 right-1" onClick={() => useStudio.getState().toggleRight(true)}>
              <PanelRightOpen />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mở cột phải</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
