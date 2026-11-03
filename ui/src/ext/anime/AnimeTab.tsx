// Port of public/ext-anime.js; behaviour unchanged.
// The Anime tab: character library (Chars), shot board with "Sinh biến thể tư thế" (Board) and the
// limited-animation manifest editor (Manifest), over routes/anime.mjs. It needs a project folder,
// not project.json, so a project made outside Studio opens here before it is imported. State lives
// in ./store.ts, so a redraw never drops what is being typed in a form.
import type { ComponentType } from "react";
import { useAnime } from "@/api/queries.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/shell/ErrorBoundary.tsx";
import { Empty } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { Board } from "./Board.tsx";
import { Chars } from "./Chars.tsx";
import { ConfirmHost } from "./confirm.tsx";
import { Manifest } from "./Manifest.tsx";
import { SUBS, useAnimeStore, type Sub } from "./store.ts";
export { LEAD, useJobEndsBadge } from "./badge.ts";

const VIEWS: Record<Sub, ComponentType> = { board: Board, chars: Chars, anim: Manifest };

export function AnimeTab() {
  const name = useStudio((s) => s.name);
  const sub = useAnimeStore((s) => s.sub);
  // All three load when the tab opens, as the old load() did; each view reads its own from the cache.
  useAnime("board", name);
  useAnime("chars", name);
  useAnime("manifest", name);

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
