// Port of public/lemo-gallery.js; behaviour unchanged.
// The state the "Phong cách" tab (the provider's style profiles, the lemo-opuscar library and own
// styles), the "Phong cách riêng" section and the shot section share (as
// createStore, lemo-gallery.js:13), the shape of GET /api/lemo/styles, and the three commands that
// talk to routes/lemo.mjs: download the library, apply a style, read a STYLE.md.
// Source: lemo-opuscar, github.com/lemomo-ai/lemo-opuscar (code and docs MIT; frames and films
// CC BY 4.0 by LemoLab). STYLE.md is third-party text: it is only ever shown as text, never as HTML.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { queryClient, say } from "@/api/client.ts";
import { keys, lemoApply, lemoFetch, lemoGuideQuery, lemoStylesQuery } from "@/api/queries.ts";
import { useStudio } from "@/store/studio.ts";
import type { AskOptions } from "@/shell/confirm.tsx";

export const POLL_MS = 1500;
const FETCH_MAX_MS = 10 * 60000;
export const DEBOUNCE_MS = 200;
export const safeUrl = (u: unknown): u is string => /^https:\/\//.test(String(u ?? ""));

// GET /api/lemo/styles (routes/lemo.mjs), the fields the UI reads.
export type StyleMode = "layer" | "grammar" | "profile";
// The source filter: "" every source · profile: the ready-made styles · library: lemo-opuscar · mine
export type StyleSource = "" | "profile" | "library" | "mine";
export const SOURCES: StyleSource[] = ["", "profile", "library", "mine"];
export interface LemoStyle {
  slug: string;
  source: "library" | "mine" | "profile" | string;
  ten: string;
  en?: string | null;
  cn?: string | null;
  nhom?: string | null;
  group_en?: string | null;
  based_on?: string | null;
  base_ten?: string | null;
  line?: string | null;
  uses?: string[] | null;
  frame?: string | null;
  film_url?: string | null;
  guide?: string | null;
  layer?: boolean;
  kind?: string | null;
  ready?: boolean;
  energy?: number | null;
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
  profiles?: number;
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

// The group filter holds genres only. Ready-made profiles and own styles have no genre of their
// own, so they sit in "Chưa phân nhóm" rather than in a made-up one.
export const NO_GROUP = "_none";
export const groupKey = (r: LemoStyle): string => (r.source === "library" && r.group_en ? r.group_en : NO_GROUP);
export interface StyleFilters { group: string; source: StyleSource }
const passes = (r: LemoStyle, f: StyleFilters, skip?: keyof StyleFilters): boolean =>
  (skip === "group" || !f.group || groupKey(r) === f.group) && (skip === "source" || !f.source || r.source === f.source);
export const filterStyles = (rows: LemoStyle[], f: StyleFilters): LemoStyle[] => rows.filter((r) => passes(r, f));
// How many styles each value of one filter would show, the other filter kept as it is.
export function countBy(rows: LemoStyle[], f: StyleFilters, axis: keyof StyleFilters): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!passes(r, f, axis)) continue;
    const k = axis === "group" ? groupKey(r) : r.source;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

// The filters live in the URL too (?q=&group=&source=), like ?tab=: a reload or a shared link
// opens the same view.
const URL_KEYS = { q: "q", group: "group", source: "source" } as const;
function fromUrl(): { q: string; group: string; source: StyleSource } {
  try {
    const p = new URLSearchParams(window.location.search);
    const source = p.get(URL_KEYS.source) ?? "";
    return { q: p.get(URL_KEYS.q) ?? "", group: p.get(URL_KEYS.group) ?? "", source: (SOURCES as string[]).includes(source) ? source as StyleSource : "" };
  } catch { return { q: "", group: "", source: "" }; }
}
function toUrl(key: keyof typeof URL_KEYS, value: string): void {
  try {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(URL_KEYS[key], value); else url.searchParams.delete(URL_KEYS[key]);
    window.history.replaceState(window.history.state, "", url);
  } catch { /* no history (tests) */ }
}

interface LemoState {
  q: string;               // the search text the list was asked for (after the debounce)
  group: string;           // the group filter, "" for every group
  source: StyleSource;     // the source filter
  busy: boolean;           // an apply is in flight
  fetching: boolean;       // the library download is running
  viewing: Viewing | null; // the STYLE.md shown in the dialog
  setQ(q: string): void;
  setGroup(g: string): void;
  setSource(t: StyleSource): void;
  setViewing(v: Viewing | null): void;
}

export const useLemo = create<LemoState>()((set) => ({
  ...fromUrl(), busy: false, fetching: false, viewing: null,
  setQ: (q) => { set({ q }); toUrl("q", q); },
  setGroup: (group) => { set({ group }); toUrl("group", group); },
  setSource: (source) => { set({ source }); toUrl("source", source); },
  setViewing: (viewing) => set({ viewing }),
}));

const stylesParams = (name: string | null, q = "") => ({ q, group: "", type: "", name: name ?? "" });

// The list the gallery shows: the server applies the search; the group and source filters run here
// (filterStyles), so each filter can count what the other would leave. The key carries the
// project name, so opening another project loads it again (the old ctx.on("project")). The
// previous answer stays on screen while a new search loads.
export function useGalleryStyles(name: string | null) {
  const q = useLemo((s) => s.q);
  return useQuery({ ...lemoStylesQuery(stylesParams(name, q)), placeholderData: keepPreviousData, select: (d) => d as LemoStyles });
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
// ask: the in-page confirm of the caller (lemo/confirm.tsx).
export async function applyStyle({ name, hasManifest, style, mode, shot = null, shots = 0, ask }: { name: string | null; hasManifest: boolean; style: LemoStyle; mode: StyleMode; shot?: string | null; shots?: number; ask: (text: string, opts?: AskOptions) => Promise<boolean> }): Promise<void> {
  if (!name || !hasManifest) { say("Mở một dự án trước", true); return; }
  const where = shot ? `shot ${shot}` : "cả dự án";
  const how = mode === "layer" ? "thêm lớp canvas (sửa index.html, ghi lemo_style vào BRIEF.md)"
    : mode === "profile" ? (shot ? "nhờ đạo diễn dựng lại shot theo phong cách dựng sẵn (BRIEF.md giữ nguyên)" : "ghi style_profile vào BRIEF.md và nhờ đạo diễn dựng lại theo phong cách dựng sẵn")
    : "nhờ đạo diễn dựng theo ngữ pháp của STYLE.md (BRIEF.md giữ nguyên)";
  if (!(await ask(`Áp "${style.ten}" cho ${where}: ${how}?`, { ok: !shot && shots > 0 ? `Áp và dựng lại ${shots} shot` : "Áp phong cách" }))) return;
  const body = { name, slug: style.slug, source: style.source, mode, shot };
  useLemo.setState({ busy: true });
  try {
    let r = await lemoApply(body);
    if (r.data?.code === "exists" && await ask("Dự án đã có một lớp canvas. Thay lớp cũ bằng phong cách này? (scene đã viết được giữ)", { ok: "Thay lớp cũ", danger: true })) r = await lemoApply({ ...body, replace: true });
    else if (r.data?.code === "markers") {
      if (await ask("index.html thiếu bốn dấu của lớp canvas. Nhờ đạo diễn chèn dấu? Xong thì bấm áp lại.", { ok: "Nhờ đạo diễn" })) {
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

export const modeText = (mode: string): string => (mode === "layer" ? "lớp canvas" : mode === "profile" ? "dựng sẵn" : "tham khảo STYLE.md");
// How a style is applied: a profile by its profile, a verified library style as a canvas layer,
// any other by the grammar of its STYLE.md.
export const modeOf = (s: LemoStyle): StyleMode => (s.source === "profile" ? "profile" : s.layer ? "layer" : "grammar");
// The card's tag and its tooltip.
export function tagOf(s: LemoStyle): { text: string; title: string; ready: boolean } {
  if (s.source === "mine") return { text: "Của bạn", title: "Phong cách riêng, đạo diễn dựng theo STYLE.md", ready: false };
  if (s.source === "profile") return { text: "Dựng sẵn", title: "Phong cách dựng sẵn: màu, chữ, chuyển cảnh và nhịp có sẵn, dựng được ngay bằng HyperFrames", ready: true };
  if (s.layer) return { text: "Lớp canvas", title: "Studio thêm được thành lớp canvas", ready: true };
  return { text: "Tham khảo", title: "Chỉ có STYLE.md: đạo diễn đọc rồi tự dựng theo ngữ pháp, kết quả không giống hệt phim mẫu", ready: false };
}
