// Port of public/timeline-markers.js (commit 22e7611); logic unchanged.
// timeline-markers.js — beat and word markers that drag. The data is GET /api/timing (the music
// bed's beats.json and each line's words.json, routes/timing.mjs), not window.TIMING: TIMING is
// rebuilt from those files by the provider's timing command after every change.
// - A beat line on the ruler drags the whole grid: release → POST /api/timing/beat with the new
//   beat0 (kept in [0, beatLen) so B(n) keeps its numbering; timeline-edit.js markerDrag).
// - A word dot on a voice block (zoomed in) drags that word's start: release → POST
//   /api/timing/word, in seconds of the voice file (the dot sits at line start + word start).
// - A press without travel picks the marker for the inspector (kind "beat" or "word").
// The beat lines and word dots themselves are React components now (beatLayer and wordDots of
// the old file); this keeps the data, the edits and the timing-job follow-up.
// When the timing job ends the player reloads (the composition's TIMING changed), the markers are
// read again, and the user is told the animatic needs approving again ("retimed"). Studio never
// writes the approval line itself.

// What createMarkers needs of the studio context: the project and its manifest, the edit flag,
// GET and POST helpers, toasts, and the event bus (jobs and project events in, "retimed" out).
export interface SendResult { status: number; error?: string; [k: string]: any } // loose: route answers differ
export interface MarkersCtx {
  state: { name: string | null; m: unknown; logs: Map<string, string[]>; retimed?: boolean };
  editable: boolean;
  api<T = unknown>(path: string): Promise<T>;
  send(path: string, body: Record<string, unknown>): Promise<SendResult>;
  toast(msg: string, err?: boolean): void;
  emit(event: string, payload?: unknown): void;
  on(event: string, fn: (e: any) => void): void; // loose: event payloads differ by name
  transport?: { reload?: () => void } | null;
}
// GET /api/timing (routes/timing.mjs): the music bed's beat grid and each line's words.json.
export interface TimingGrid { music_id: string; sha: string; beat0: number; beatLen: number }
export interface TimingLine { id: string; sha: string; offset: number; words: { text: string; start: number; end: number }[] }
export interface TimingData { grid?: TimingGrid | null; lines?: TimingLine[] }
export interface Markers {
  load(): Promise<TimingData | null>;
  get(): TimingData | null;
  line(id: string): TimingLine | null;
  editable(): boolean;
  setBeat(beat0: number): Promise<boolean> | false;
  setWord(lineId: string, index: number, fields: { start?: number; end?: number }): Promise<boolean> | false;
  undo(): Promise<boolean>;
  wordSync(): Promise<void>;
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export function createMarkers(ctx: MarkersCtx, { onChange }: { onChange: () => void }): Markers {
  let data: TimingData | null = null, forName: string | null = null, seq = 0;

  async function load() {
    const name = ctx.state.name;
    const my = ++seq;
    if (!name || !ctx.state.m) { data = null; forName = null; onChange(); return null; }
    try {
      const d = await ctx.api<TimingData>(`/api/timing?name=${encodeURIComponent(name)}`);
      if (my !== seq || name !== ctx.state.name) return data;
      data = d; forName = name;
    } catch (e) {
      if (my !== seq) return data;
      data = null; forName = name;
      console.warn("timing markers:", (e as Error).message);
    }
    onChange();
    return data;
  }

  const get = () => (forName === ctx.state.name ? data : null);
  const line = (id: string): TimingLine | null => get()?.lines?.find((l) => l.id === id) ?? null;
  const editable = () => ctx.editable && Boolean(get());

  // A sent change: the answer starts the timing job; its exit (below) finishes the change.
  async function send(path: string, body: Record<string, unknown>, what: string): Promise<boolean> {
    const r = await ctx.send(path, { name: ctx.state.name, ...body });
    if (r.status !== 200) { ctx.toast(r.error ?? `Lỗi ${r.status}`, true); await load(); return false; }
    if (r.changed === false) { ctx.toast("Không có gì thay đổi"); await load(); return true; }
    ctx.toast(r.warning ? `${what}; chưa dựng lại TIMING: ${r.warning}` : `${what}; đang dựng lại TIMING…`, Boolean(r.warning));
    await load();
    return true;
  }

  function setBeat(beat0: number): Promise<boolean> | false {
    const g = get()?.grid;
    if (!g) return false;
    return send("/api/timing/beat", { music_id: g.music_id, base_sha: g.sha, beat0: r3(beat0) }, `Đã dời lưới phách, beat0 ${r3(beat0).toFixed(3)}s`);
  }
  function setWord(lineId: string, index: number, fields: { start?: number; end?: number }): Promise<boolean> | false {
    const l = line(lineId);
    if (!l) return false;
    return send("/api/timing/word", { line_id: lineId, index, base_sha: l.sha, ...fields }, `Đã dời từ "${l.words[index]?.text ?? index}"`);
  }
  async function undo(): Promise<boolean> {
    const r = await ctx.send("/api/timing/undo", { name: ctx.state.name });
    if (r.status !== 200) { ctx.toast(r.status === 422 ? "Không còn mốc nào để hoàn tác" : r.error ?? `Lỗi ${r.status}`, r.status !== 422); return false; }
    ctx.toast(`Đã hoàn tác mốc (${r.file}); đang dựng lại TIMING…`);
    await load();
    return true;
  }
  async function wordSync(): Promise<void> {
    const r = await ctx.send("/api/timing/word-sync", { name: ctx.state.name });
    if (r.status !== 200) return ctx.toast(r.error ?? `Lỗi ${r.status}`, true);
    ctx.toast("Đang kiểm khớp lời…");
  }

  // The timing job of this project ended: reload the player and the markers. A word-sync check
  // ended: count its PASS / WARN / FAIL lines (the log is in the Xuất bản tab).
  ctx.on("jobs", (e: any) => { // loose: an SSE jobs event as the server sends it
    if (e?.type !== "exit" || e.job?.name !== ctx.state.name) return;
    if (e.job.kind === "word-sync") {
      const n: Record<string, number> = { PASS: 0, WARN: 0, FAIL: 0 };
      for (const l of ctx.state.logs.get(e.job.id) ?? []) { const k = /^(PASS|WARN|FAIL)\b/.exec(l)?.[1]; if (k) n[k]++; }
      return ctx.toast(`Khớp lời: ${n.PASS} đạt, ${n.WARN} cảnh báo, ${n.FAIL} lệch (log ở tab Xuất bản)`, n.FAIL > 0 || (e.job.code !== 0 && e.job.code !== 1));
    }
    if (e.job.kind !== "timing") return;
    if (e.job.code === 0) {
      ctx.state.retimed = true;
      ctx.transport?.reload?.();
      ctx.toast("Đã dựng lại TIMING. Animatic cần duyệt lại");
      ctx.emit("retimed");
    } else if (e.job.status !== "cancelled") {
      const tail = ctx.state.logs.get(e.job.id)?.at(-1) ?? "";
      ctx.toast(`Dựng lại TIMING lỗi (exit ${e.job.code})${tail ? `: ${tail.slice(0, 160)}` : ""}`, true);
    }
    load();
  });
  ctx.on("project", () => { ctx.state.retimed = false; });

  return { load, get, line, editable, setBeat, setWord, undo, wordSync };
}
