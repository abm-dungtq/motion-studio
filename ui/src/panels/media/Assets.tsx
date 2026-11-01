// Port of public/panels.js; the grid now shows media first and folds the other files away.
// "File trong assets/" (panels.js:181-186): a grid of the project's pictures, clips and sounds;
// a picture, a video poster or the file name (thumb() of public/dom.js:42-48). Code, fonts, ledgers
// and other files wait in a closed "Khác" group so they do not bury the pictures.
import { useFiles } from "@/api/queries.ts";
import { isMedia } from "@/core/format.ts";
import { fileUrl } from "@/core/ui-format.ts";
import { Empty, Fail, Loading } from "@/shell/states.tsx";

const AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const CELL = "aspect-[16/10] w-full overflow-hidden rounded-sm border border-border bg-panel-2 object-cover";

export function Thumb({ name, path }: { name: string; path: string }) {
  const src = fileUrl(name, path);
  const kind = isMedia(path);
  if (kind === "img") return <img className={CELL} src={src} alt={path} title={path} loading="lazy" />;
  if (kind === "video") return <video className={CELL} src={`${src}#t=0.1`} title={path} muted preload="metadata" />;
  return (
    <div className={`${CELL} flex items-center justify-center p-1 text-[11px] text-muted-foreground`} title={path}>
      <span className="block max-w-full min-w-0 truncate">{path.split("/").pop()}</span>
    </div>
  );
}

export function Assets({ name }: { name: string }) {
  const { data, error, isPending } = useFiles(name, "assets");
  if (error) return <Fail error={error} />;
  if (isPending) return <Loading />;
  const files = data.filter((f) => !/\.json$/i.test(f.path));
  if (!files.length) return <Empty text="Chưa có file nào trong assets/. Giao việc cho AI tìm footage hoặc tạo hình cho dự án." action="Giao việc cho AI" to="ai" />;
  const media = files.filter((f) => isMedia(f.path) || AUDIO.test(f.path));
  const other = files.filter((f) => !media.includes(f));
  const grid = (list: typeof files) => <div className="grid grid-cols-3 gap-1.5">{list.map((f) => <Thumb key={f.path} name={name} path={f.path} />)}</div>;
  return (
    <div className="flex flex-col gap-2" data-assets="">
      {media.length ? grid(media) : <p className="m-0 text-xs text-muted-foreground">Chưa có ảnh, clip hay âm thanh trong assets/.</p>}
      {other.length ? (
        <details data-assets-other="">
          <summary className="cursor-pointer text-xs text-muted-foreground">Khác ({other.length}): code, font, dữ liệu</summary>
          <div className="mt-1.5">{grid(other)}</div>
        </details>
      ) : null}
    </div>
  );
}
