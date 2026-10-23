// Port of public/lemo-gallery.js; behaviour unchanged.
// The state the "Phong cách" tab, the "Phong cách riêng" section and the shot section share (as
// createStore, lemo-gallery.js:13), the shape of GET /api/lemo/styles, and the three commands that
// talk to routes/lemo.mjs: download the library, apply a style, read a STYLE.md.
// Source: lemo-opuscar, github.com/lemomo-ai/lemo-opuscar (code and docs MIT; frames and films
// CC BY 4.0 by LemoLab). STYLE.md is third-party text: it is only ever shown as text, never as HTML.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { queryClient, say } from "@/api/client.ts";
import { keys, lemoApply, lemoFetch, lemoGuideQuery, lemoStylesQuery } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";

export const POLL_MS = 1500;
const FETCH_MAX_MS = 10 * 60000;
export const DEBOUNCE_MS = 200;
export const safeUrl = (u: unknown): u is string => /^https:\/\//.test(String(u ?? ""));

// GET /api/lemo/styles (routes/lemo.mjs), the fields the UI reads.
export type StyleMode = "layer" | "grammar";
export interface LemoStyle {
  slug: string;
  source: "library" | "mine" | string;
  ten: string;
  en?: string | null;
  cn?: string | null;
  nhom?: string | null;
  based_on?: string | null;
  base_ten?: string | null;
  line?: string | null;
  uses?: string[] | null;
  frame?: string | null;
  film_url?: string | null;
  guide?: string | null;
  layer?: boolean;
  kind?: string | null;
}
export interface LemoApplied { slug: string; mode: StyleMode | string }
export interface LemoDraft {
  style?: { slug: string; en?: string | null; cn?: string | null; based_on?: string | null; line?: string | null } | null;
  frame?: string | null;
  frame_note?: string | null;
  changes?: string | null;
  valid?: boolean;
  has_guide?: boolean;
}
export interface LemoProject {
  project?: LemoApplied | null;
  shots?: Record<string, LemoApplied>;
  vertical?: boolean;
  draft?: LemoDraft | null;
}
export interface LemoJob { status: string; code?: number | null; tail?: string[] }
export interface LemoCredit { text?: string; url?: string; code_license?: string }
export interface LemoStyles {
  fetched: boolean;
  total: number;
  groups: { id: string; ten: string; count: number }[];
  rows: LemoStyle[];
  warnings?: string[];
  layer_available?: boolean;
  my_dir?: string;
  fetch_job?: LemoJob | null;
  project?: LemoProject | null;
  credit?: LemoCredit;
}

export interface Viewing { style: LemoStyle; text: string }

interface LemoState {
  q: string;               // the search text the list was asked for (after the debounce)
  group: string;           // the group filter, "" for every group
  busy: boolean;           // an apply is in flight
  fetching: boolean;       // the library download is running
  viewing: Viewing | null; // the STYLE.md shown in the dialog
  setQ(q: string): void;
  setGroup(g: string): void;
  setViewing(v: Viewing | null): void;
}

export const useLemo = create<LemoState>()((set) => ({
  q: "", group: "", busy: false, fetching: false, viewing: null,
  setQ: (q) => set({ q }),
  setGroup: (group) => set({ group }),
  setViewing: (viewing) => set({ viewing }),
}));

const stylesParams = (name: string | null, q = "", group = "") => ({ q, group, name: name ?? "" });

// The list the gallery shows (search and group applied). The key carries the project name, so
// opening another project loads it again (the old ctx.on("project")). The previous answer stays
// on screen while a new search loads.
export function useGalleryStyles(name: string | null) {
  const q = useLemo((s) => s.q), group = useLemo((s) => s.group);
  return useQuery({ ...lemoStylesQuery(stylesParams(name, q, group)), placeholderData: keepPreviousData, select: (d) => d as LemoStyles });
}

// The whole list (no search, no group): the old store.allRows, for the shot and own-style sections.
export function useAllStyles(name: string | null) {
  return useQuery({ ...lemoStylesQuery(stylesParams(name)), select: (d) => d as LemoStyles });
}

// The old store.load() after a write: every list of the gallery again.
export const reloadStyles = (): Promise<void> => queryClient.invalidateQueries({ queryKey: keys.lemoStyles() });

async function loadAll(): Promise<LemoStyles | null> {
  try {
    return (await queryClient.fetchQuery({ ...lemoStylesQuery(stylesParams(useStudio.getState().name)), staleTime: 0 })) as LemoStyles;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// POST /api/lemo/fetch, then ask again every 1.5 s until the library is there (lemo-gallery.js:30-44).
export async function fetchLibrary(): Promise<void> {
  const s = useLemo.getState();
  if (s.fetching) return;
  useLemo.setState({ fetching: true });
  try {
    const r = await lemoFetch();
    if (r.status !== 200) { say(r.error ?? `Lỗi ${r.status}`, true); return; }
    const t0 = Date.now();
    while (Date.now() - t0 < FETCH_MAX_MS) {
      const d = await loadAll();
      if (d?.fetched) break;
      const j = d?.fetch_job;
      if (j && j.status !== "running" && j.status !== "cancelling") { say(`Tải thư viện lỗi: ${(j.tail ?? []).slice(-1)[0] ?? `exit ${j.code}`}`, true); break; }
      await sleep(POLL_MS);
    }
    await reloadStyles();
  } finally {
    useLemo.setState({ fetching: false });
  }
}

// POST /api/lemo/apply, with the follow-ups the answer asks for: replace an existing layer, or
// ask the director to insert the markers first (lemo-gallery.js:52-73).
export async function applyStyle({ name, hasManifest, style, mode, shot = null }: { name: string | null; hasManifest: boolean; style: LemoStyle; mode: StyleMode; shot?: string | null }): Promise<void> {
  if (!name || !hasManifest) { say("Mở một dự án trước", true); return; }
  const where = shot ? `shot ${shot}` : "cả dự án";
  const how = mode === "layer" ? "thêm lớp canvas (sửa index.html, ghi lemo_style vào BRIEF.md)" : "nhờ đạo diễn dựng theo ngữ pháp của STYLE.md (BRIEF.md giữ nguyên)";
  if (!window.confirm(`Áp "${style.ten}" cho ${where}: ${how}?`)) return;
  const body = { name, slug: style.slug, source: style.source, mode, shot };
  useLemo.setState({ busy: true });
  try {
    let r = await lemoApply(body);
    if (r.data?.code === "exists" && window.confirm("Dự án đã có một lớp canvas. Thay lớp cũ bằng phong cách này? (scene đã viết được giữ)")) r = await lemoApply({ ...body, replace: true });
    else if (r.data?.code === "markers") {
      if (window.confirm("index.html thiếu bốn dấu của lớp canvas. Nhờ đạo diễn chèn dấu? Xong thì bấm áp lại.")) {
        const m = await lemoApply({ ...body, mode: "markers" });
        say(m.status === 200 ? "Đã gửi yêu cầu chèn dấu cho đạo diễn" : (m.error ?? `Lỗi ${m.status}`), m.status !== 200);
      }
      return;
    }
    if (r.status === 200) say(`Đã áp "${style.ten}" cho ${where}; đã gửi yêu cầu cho đạo diễn${r.data?.runner === "mcp" ? " (chờ phiên Claude Code nhận việc)" : ""}`);
    else if (r.data?.code !== "exists") say(r.error ?? `Lỗi ${r.status}`, true);
  } finally {
    useLemo.setState({ busy: false });
    await reloadStyles();
  }
}

// GET /api/lemo/guide, then the STYLE.md dialog (lemo-gallery.js:76-88).
export async function showGuide(style: LemoStyle): Promise<void> {
  let text: string;
  try {
    text = String((await queryClient.fetchQuery(lemoGuideQuery(style.slug, style.source))).text ?? "");
  } catch (e) {
    say(`Không đọc được STYLE.md: ${(e as Error).message}`, true);
    return;
  }
  useLemo.getState().setViewing({ style, text });
}

export const modeText = (mode: string): string => (mode === "layer" ? "lớp canvas" : "theo ngữ pháp");
