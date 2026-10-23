// Port of public/panels.js; behaviour unchanged.
// "File trong assets/" (panels.js:181-186): a grid of the project's assets, .json files left out;
// a picture, a video poster or the file name (thumb() of public/dom.js:42-48).
import { useFiles } from "@/api/queries.ts";
import { isMedia } from "@/core/format.ts";
import { fileUrl } from "@/core/ui-format.ts";
import { Empty, Fail, Loading } from "@/shell/states.tsx";

const CELL = "aspect-[16/10] w-full overflow-hidden rounded-sm border border-border bg-panel-2 object-cover";

export function Thumb({ name, path }: { name: string; path: string }) {
  const src = fileUrl(name, path);
  const kind = isMedia(path);
  if (kind === "img") return <img className={CELL} src={src} alt={path} title={path} loading="lazy" />;
  if (kind === "video") return <video className={CELL} src={`${src}#t=0.1`} title={path} muted preload="metadata" />;
  return <div className={`${CELL} grid place-items-center p-0.5 text-center text-[11px] text-muted-foreground`} title={path}>{path.split("/").pop()}</div>;
}

export function Assets({ name }: { name: string }) {
  const { data, error, isPending } = useFiles(name, "assets");
  if (error) return <Fail error={error} />;
  if (isPending) return <Loading />;
  const shown = data.filter((f) => !/\.json$/i.test(f.path));
  if (!shown.length) return <Empty text="Chưa có file nào trong assets/. Giao việc cho AI tìm footage hoặc tạo hình cho dự án." action="Giao việc cho AI" to="ai" />;
  return <div className="grid grid-cols-3 gap-1.5" data-assets="">{shown.map((f) => <Thumb key={f.path} name={name} path={f.path} />)}</div>;
}
