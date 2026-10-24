// The Tài sản tab of a series episode: the consent cards still waiting, then one sheet per
// character, the backgrounds board and the props board, built from every batch of the project
// (GET /api/assets). A running batch is followed by polling the assets and by the project's job
// feed; when its job ends the boards load again and a toast says so. Screen cards and thumbnails
// need no board: they are used from the project as drawn.
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, say } from "@/api/client.ts";
import { jobsQuery } from "@/api/queries.ts";
import { Empty, Fail, Loading } from "@/shell/states.tsx";
import { useStudio } from "@/store/studio.ts";
import { seriesKeys, useAssets, useSeries } from "./api.ts";
import { Board } from "./Board.tsx";
import { ConsentCard } from "./ConsentCard.tsx";
import type { AssetsList, BoardData, BoardItem } from "./types.ts";

export const LEAD = "Ảnh của series: đồng ý đợt vẽ, duyệt tờ nhân vật, nền và đạo cụ";
export const KIND = "asset-batch";

// Every board of the project, in the order of the tab: character sheets, backgrounds, props.
export function boardsOf(list: AssetsList | undefined): BoardData[] {
  const all: BoardItem[] = (list?.batches ?? []).flatMap((b) => b.items.map((it) => ({ ...it, batch: b.batch })));
  const chars = [...new Set(all.filter((it) => it.kind === "pose" && it.character).map((it) => it.character as string))].sort();
  const boards: BoardData[] = chars.map((c) => ({ key: `character:${c}`, title: `Tờ nhân vật ${c}`, zoom: 4, items: all.filter((it) => it.kind === "pose" && it.character === c) }));
  const bgs = all.filter((it) => it.kind === "background");
  if (bgs.length) boards.push({ key: "background", title: "Bảng nền", zoom: 2, items: bgs });
  const props = all.filter((it) => it.kind === "prop");
  if (props.length) boards.push({ key: "prop", title: "Bảng đạo cụ", zoom: 4, items: props });
  return boards;
}

// Loads the boards again whenever the job feed shows a batch job of this project change state,
// and says when a batch that was running has ended.
function useBatchEnds(name: string, list: AssetsList | undefined): void {
  const { data: jobs } = useQuery({ ...jobsQuery(name), enabled: false });
  const feed = (jobs ?? []).filter((j) => j.kind === KIND).map((j) => `${j.id}:${j.status}`).join(",");
  useEffect(() => {
    if (feed) void queryClient.invalidateQueries({ queryKey: seriesKeys.assets(name) });
  }, [feed, name]);

  const was = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!list) return;
    const now = new Set(list.batches.filter((b) => b.running || b.job).map((b) => b.batch));
    for (const b of was.current) {
      if (now.has(b)) continue;
      const v = list.batches.find((x) => x.batch === b);
      if (v) say(v.stopped ? `Đợt ${b} dừng giữa chừng${v.message ? `: ${v.message}` : ""}` : `Đợt ${b} đã xong, bảng đã tải lại`, Boolean(v.stopped));
    }
    was.current = now;
  }, [list]);
}

export function AssetsTab() {
  const name = useStudio((s) => s.name);
  if (!name) return <Empty text="Chưa mở dự án nào. Chọn một dự án ở thanh trên cùng." />;
  return <SeriesAssets key={name} name={name} />;
}

function SeriesAssets({ name }: { name: string }) {
  const s = useSeries(name);
  const q = useAssets(name, Boolean(s.data));
  useBatchEnds(name, q.data);
  const boards = useMemo(() => boardsOf(q.data), [q.data]);

  if (s.error) return <Fail error={s.error} />;
  if (s.isPending) return <Loading />;
  if (!s.data) return <Empty text="Dự án này không thuộc series nào." />;
  if (q.error) return <Fail error={q.error} />;
  if (!q.data) return <Loading />;

  const cards = q.data.batches.flatMap((b) => (b.consent ? [b.consent] : []));
  const running = q.data.batches.filter((b) => b.running || b.job);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="m-0 text-xs text-muted-foreground">{`Thuộc series: ${s.data.name}`}</p>
      {cards.map((c) => <ConsentCard key={c.id} name={name} card={c} />)}
      {running.map((b) => <p key={b.batch} className="m-0 text-xs text-muted-foreground">{`Đợt ${b.batch} đang chạy. Bảng tự tải lại khi xong.`}</p>)}
      {q.data.batches.filter((b) => b.error).map((b) => <p key={b.batch} className="m-0 text-xs text-warn">{`Đợt ${b.batch} có lỗi: ${b.error}`}</p>)}
      {boards.length
        ? boards.map((b) => <Board key={b.key} name={name} board={b} running={running.length > 0} />)
        : <Empty text="Chưa có đợt ảnh nào. Nhờ đạo diễn viết một đợt vẽ, thẻ đồng ý sẽ hiện ở đây." />}
    </div>
  );
}
