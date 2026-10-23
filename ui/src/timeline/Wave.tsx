// Port of the waveforms of public/timeline.js (:223, :232, :274-279, :469-471); behaviour unchanged.
// A canvas over a voice or music block, painted once its peaks are in (IndexedDB, else one decode
// per file, core/waveform.ts). Without the file stamps of GET /api/timeline/media yet it waits:
// they key the cache. It paints in its own CSS color (the track token) and again when its block
// changes width.
import { memo, useEffect, useRef } from "react";
import type { FileStamp } from "@/api/types.ts";
import { drawWave, peaks } from "@/core/waveform.ts";
import { cn } from "@/lib/utils";

export interface WaveProps { url: string; stamp: FileStamp | null | undefined; ready: boolean; from: number; to: number; gain?: number; width: number; className?: string }

export const Wave = memo(function Wave({ url, stamp, ready, from, to, gain = 1, width, className }: WaveProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = stamp?.size, mtime = stamp?.mtime;
  useEffect(() => {
    if (!ready || !(to > from)) return;
    let alive = true;
    const st = size != null && mtime != null ? { size, mtime } : null;
    void peaks(url, st).then((data) => { if (alive && ref.current?.isConnected) drawWave(ref.current, data, { from, to, gain }); });
    return () => { alive = false; };
  }, [url, size, mtime, ready, from, to, gain, width]);
  return <canvas ref={ref} width={0} height={0} aria-hidden="true" className={cn("wave pointer-events-none absolute inset-0 -z-10 h-full w-full", className)} />;
});
