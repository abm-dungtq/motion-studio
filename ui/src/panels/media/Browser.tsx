// Port of public/panels.js; behaviour unchanged.
// "Chọn file trên máy" (panels.js:142-178): one folder level per GET /api/media/browse, the path box
// (Enter opens what is typed) and "Lên". The first visit opens ~/Movies when it exists, else the
// home folder the server reports; the folder last shown is kept while the page lives, so leaving
// the tab and coming back shows it again. "Thêm" registers a file (POST /api/media/register), which
// copies a file from outside the workspace into footage/raw.
import { useCallback, useEffect, useRef, useState } from "react";
import { queryClient, say } from "@/api/client.ts";
import { mediaBrowseQuery, mediaRegister } from "@/api/queries.ts";
import { mb } from "@/core/ui-format.ts";
import { Button, Input } from "@/shell/controls.tsx";
import { Loading } from "@/shell/states.tsx";
import { KIND_VI } from "./Registered.tsx";

export interface BrowseEntry { type: "dir" | "file" | string; name: string; path: string; kind?: string; size?: number }
export interface BrowseListing { path: string; parent: string | null; entries: BrowseEntry[] }

// The folder last shown (panels.js memo.browse).
export const browseMemo: { path: string | null } = { path: null };

const browse = (path: string | null): Promise<BrowseListing> =>
  queryClient.fetchQuery({ ...mediaBrowseQuery(path), staleTime: 0 }) as Promise<BrowseListing>;

type View = { kind: "loading" } | { kind: "list"; entries: BrowseEntry[]; seq: number } | { kind: "error"; message: string };

function FileRow({ name, entry, editable }: { name: string; entry: BrowseEntry; editable: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const add = async () => {
    setState("busy");
    const r = await mediaRegister({ name, src: entry.path });
    if (r.status !== 200) { setState("idle"); say(r.error ?? `Lỗi ${r.status}`, true); return; }
    setState("done");
    say(r.data?.existing ? `${entry.name} đã có trong danh sách` : `Đã thêm ${entry.name}${r.data?.copied ? ", đã chép vào footage/raw" : ""}`);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-b border-border px-2.5 py-1.5 text-sm last:border-b-0" data-entry="file">
      <span className="truncate" title={entry.path}>{entry.name}</span>
      <Button className="row-span-2" aria-label={`Thêm ${entry.name}`} disabled={!editable || state !== "idle"} onClick={() => { void add(); }}>
        {state === "busy" ? "Đang thêm…" : state === "done" ? "Đã thêm" : "Thêm"}
      </Button>
      <small className="text-xs text-muted-foreground tabular-nums">{`${KIND_VI[entry.kind ?? ""] ?? entry.kind} · ${mb(Number(entry.size) || 0)}`}</small>
    </div>
  );
}

export function Browser({ name, editable }: { name: string; editable: boolean }) {
  const [text, setText] = useState(browseMemo.path ?? "");
  const [parent, setParent] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "loading" });
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const go = useCallback(async (path: string | null, first = false) => {
    const n = ++seq.current;
    setView({ kind: "loading" });
    try {
      let d = await browse(path);
      // First visit: ~/Movies when it exists, else the home folder the server reports.
      const movies = first ? d.entries.find((x) => x.type === "dir" && x.name === "Movies") : null;
      if (movies) d = await browse(movies.path);
      if (n !== seq.current) return;
      browseMemo.path = d.path;
      setText(d.path);
      requestAnimationFrame(() => { if (input.current) input.current.scrollLeft = input.current.scrollWidth; }); // show the deepest folder
      setParent(d.parent);
      setView({ kind: "list", entries: d.entries, seq: n });
    } catch (e) {
      if (n === seq.current) setView({ kind: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => { void go(browseMemo.path, !browseMemo.path); }, [go]);

  return (
    <>
      <div className="flex gap-1.5">
        <Input
          ref={input}
          value={text}
          aria-label="Thư mục đang xem"
          spellCheck={false}
          placeholder="/Users/…/Movies"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void go(text.trim()); } }}
        />
        <Button disabled={!parent} onClick={() => { if (parent) void go(parent); }}>Lên</Button>
      </div>
      <div className="flex max-h-80 flex-col overflow-auto rounded-md border border-border bg-panel" aria-label="Thư mục và file media" role="group">
        {view.kind === "loading" ? <Loading /> : null}
        {view.kind === "error" ? <p className="m-0 p-3 text-sm text-muted-foreground">{`Không mở được: ${view.message}. Gõ đường dẫn khác hoặc bấm Lên.`}</p> : null}
        {view.kind === "list" && !view.entries.length ? <p className="m-0 p-3 text-sm text-muted-foreground">Thư mục này không có thư mục con hay file media. Bấm Lên hoặc gõ đường dẫn khác.</p> : null}
        {view.kind === "list" ? view.entries.map((e) => (e.type === "dir" ? (
          <button
            key={`${view.seq}:${e.path}`}
            type="button"
            className="flex min-h-8 items-center gap-2 border-b border-border bg-panel px-2.5 py-1 text-left text-sm font-semibold text-foreground last:border-b-0 hover:bg-panel-2"
            title={e.path}
            data-entry="dir"
            onClick={() => { void go(e.path); }}
          >
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="text-muted-foreground" aria-hidden="true">›</span>
          </button>
        ) : <FileRow key={`${view.seq}:${e.path}`} name={name} entry={e} editable={editable} />)) : null}
      </div>
    </>
  );
}
