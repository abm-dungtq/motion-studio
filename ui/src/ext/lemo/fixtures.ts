// Small answers of GET /api/lemo/styles and friends for the component tests of this folder, in the
// shape a live test Studio answers (routes/lemo.mjs, make-test-root.mjs projects).
import type { LemoStyles } from "./store.ts";

export const NAME = "thuy-mau-demo";

const lib = (slug: string, ten: string, en: string, group: string, nhom: string, extra: Record<string, unknown> = {}) => ({
  slug, source: "library", ten, en, cn: null, nhom, group_en: group,
  line: `${en} line`, uses: ["Brand history"], frame: `/api/lemo/frame/${slug}.jpg`,
  film_url: `https://github.com/lemomo-ai/lemo-opuscar/releases/download/films/${slug}.mp4`,
  guide: `/cache/styles/${slug}/STYLE.md`, layer: false, kind: null, ...extra,
});

export const LIBRARY = [
  lib("watercolor", "Thuỷ màu", "Watercolor", "Painting", "Hội hoạ", { layer: true }),
  lib("ukiyo-e", "Tranh khắc gỗ", "Ukiyo-e", "East Asian Traditions", "Truyền thống Đông Á"),
  lib("news-desk", "Bàn tin tức", "News Desk", "News", "Tin tức"),
];
export const MINE = [{ ...lib("my-ink", "Mực của tôi", "My Ink", "Painting", "Hội hoạ"), source: "mine", film_url: null }];

export const GROUPS = [
  { id: "Painting", ten: "Hội hoạ", count: 2 },
  { id: "East Asian Traditions", ten: "Truyền thống Đông Á", count: 1 },
  { id: "News", ten: "Tin tức", count: 1 },
];

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// The styles route: a search over ten/en and a group filter, as lib/lemo/catalog.mjs search().
export function stylesRoute(over: Partial<LemoStyles> & { mine?: boolean } = {}) {
  const { mine = false, ...rest } = over;
  const all = [...(mine ? MINE : []), ...LIBRARY];
  return (url: URL) => {
    const q = fold(url.searchParams.get("q") ?? ""), group = url.searchParams.get("group") ?? "";
    const rows = all.filter((r) => (!q || fold(`${r.ten} ${r.en}`).includes(q)) && (!group || r.group_en === group));
    return {
      fetched: true, total: all.length, groups: GROUPS, rows, warnings: [], layer_available: true,
      my_dir: "/tmp/ms-react-lemo-test/my-styles", fetch_job: null,
      project: { vertical: false, draft: null }, credit: { text: "Ảnh và phim mẫu: LemoLab, CC BY 4.0", url: "https://github.com/lemomo-ai/lemo-opuscar", code_license: "MIT" },
      ...rest,
    };
  };
}

export const PROJECTS = [{ name: NAME, title: "Thuỷ màu", has_manifest: true, editable: true, version: 4 }];
export const MANIFEST = { version: 4, shots: [{ id: "s1", start: 0, end: 5 }, { id: "s2", start: 5, end: 10 }], lines: [], capabilities: { editable: true } };
