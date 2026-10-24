// Pixel art seen at 2×, 4× or 8×: the image keeps hard pixel edges (image-rendering: pixelated) and
// is scaled with CSS zoom, so a small sprite grows by whole pixels inside its scrolling cell.
import { cn } from "@/lib/utils";
import { Button } from "@/shell/controls.tsx";
import type { Zoom } from "./types.ts";

export const ZOOMS: readonly Zoom[] = [2, 4, 8];
const SIZE: Record<Zoom, string> = { 2: "[zoom:2]", 4: "[zoom:4]", 8: "[zoom:8]" };

export function ZoomBar({ zoom, onZoom, label }: { zoom: Zoom; onZoom: (z: Zoom) => void; label: string }) {
  return (
    <div role="group" aria-label={`Phóng ảnh ${label}`} className="flex items-center gap-1">
      {ZOOMS.map((z) => (
        <Button key={z} variant={z === zoom ? "primary" : "default"} aria-pressed={z === zoom} className="h-7 px-2 text-xs" onClick={() => onZoom(z)}>{`${z}×`}</Button>
      ))}
    </div>
  );
}

export function PixelImage({ src, alt, zoom }: { src: string; alt: string; zoom: Zoom }) {
  return (
    <div className="max-h-96 overflow-auto rounded bg-background">
      <img src={src} alt={alt} loading="lazy" data-zoom={zoom} style={{ imageRendering: "pixelated" }} className={cn("block max-w-none [image-rendering:pixelated]", SIZE[zoom])} />
    </div>
  );
}
