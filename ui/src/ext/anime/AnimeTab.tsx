// Port of public/ext-anime.js; behaviour unchanged.
// The Anime tab: character library (Chars), shot board with "Sinh biến thể tư thế" (Board) and the
// limited-animation manifest editor (Manifest), over routes/anime.mjs. It needs a project folder,
// not project.json, so a project made outside Studio opens here before it is imported. State lives
// in ./store.ts, so a redraw never drops what is being typed in a form.
import type { ComponentType } from "react";
import { say } from "@/api/client.ts";
import { useAnime } from "@/api/queries.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/shell/ErrorBoundary.tsx";
import { Empty } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { Board } from "./Board.tsx";
import { Chars } from "./Chars.tsx";
import { ConfirmHost } from "./confirm.tsx";
import { Manifest } from "./Manifest.tsx";
import { reload, SUBS, useAnimeStore, type Sub } from "./store.ts";
import { useFollow } from "./useJob.ts";

export const LEAD = "Motion comic: nhân vật, shot board, biến thể tư thế và hoạt hình lật ảnh";

const VIEWS: Record<Sub, ComponentType> = { board: Board, chars: Chars, anim: Manifest };

// The end of each followed job, whatever sub-tab is open (the onEnd of the old A.follow calls).
function useJobEnds(name: string | null): void {
  useFollow("variant", (j) => {
    const line = [...(j.log ?? [])].reverse().find((l) => l.startsWith("RESULT "));
    let out: { ok?: boolean; file?: string; width?: number; color?: string; error?: string } | null = null;
    try { out = line ? JSON.parse(line.slice(7)) : null; } catch { /* shown in the log */ }
    say(out?.ok ? `Đã có ${String(out.file).split("/").pop()} (${out.width}px, nền ${out.color})` : `Không sinh được: ${out?.error ?? `exit ${j.job.code}`}`, !out?.ok);
    void reload(name, "board");
  });
  useFollow("sheet", (j, ref) => {
    say(j.job.code === 0 ? `Đã có sheet của ${ref.label}` : `Không sinh được sheet (exit ${j.job.code})`, j.job.code !== 0);
    void reload(name, "chars", "board");
  });
  useFollow("build", () => { void reload(name, "board"); });
}

export function AnimeTab() {
  const name = useStudio((s) => s.name);
  const sub = useAnimeStore((s) => s.sub);
  // All three load when the tab opens, as the old load() did; each view reads its own from the cache.
  useAnime("board", name);
  useAnime("chars", name);
  useAnime("manifest", name);
  useJobEnds(name);

  if (!name) return <Empty text="Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng." />;
  return (
    <Tabs value={sub} onValueChange={(v) => useAnimeStore.getState().setSub(v as Sub)} className="min-w-0 gap-3">
      <TabsList aria-label="Mục của tab Anime" className="grid w-full grid-cols-3">
        {SUBS.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}
      </TabsList>
      {SUBS.map(([id]) => {
        const View = VIEWS[id];
        return (
          <TabsContent key={id} value={id} className="flex min-w-0 flex-col gap-3">
            <ErrorBoundary what={`anime ${id}`} resetKey={`${name}/${id}`} fallback={(e) => <p className="m-0 p-3 text-sm text-muted-foreground">{`Lỗi giao diện: ${e.message}`}</p>}>
              <View />
            </ErrorBoundary>
          </TabsContent>
        );
      })}
      <ConfirmHost />
    </Tabs>
  );
}
