// Port of thumb() of public/dom.js:42-48; behaviour unchanged. A project file as a small preview:
// an image, a muted video at 0.1 s, or the file name.
import { isMedia } from "@/core/format.ts";
import { fileUrl } from "@/core/ui-format.ts";

const BOX = "h-16 max-w-28 rounded-sm border border-border bg-stage object-cover";

export function Thumb({ name, path }: { name: string; path: string }) {
  const src = fileUrl(name, path);
  const kind = isMedia(path);
  if (kind === "img") return <img className={BOX} src={src} alt={path} title={path} loading="lazy" />;
  if (kind === "video") return <video className={BOX} src={`${src}#t=0.1`} title={path} muted preload="metadata" />;
  return <div className="truncate rounded-sm border border-border bg-panel-2 px-2 py-1 text-xs" title={path}>{path.split("/").pop()}</div>;
}
