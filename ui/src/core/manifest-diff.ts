// What changed between two project.json versions, told the way an editor reads a timeline: shots
// added, removed, longer or shorter, renamed or re-sourced; lines whose words changed; the music.
// Shots and lines are matched by id. A shot that only moved because an earlier one grew is not a
// change: only its length counts, not its start. version and updated are ignored.

interface ShotLike { id: string; start: number; end: number; [k: string]: unknown }
interface LineLike { id: string; text?: string; [k: string]: unknown }
interface MusicLike { id: string; [k: string]: unknown }
export interface ManifestLike { shots?: ShotLike[]; lines?: LineLike[]; music?: MusicLike[] }

export interface FieldChange { field: string; before: unknown; after: unknown }
export type Change =
  | { kind: "shot-added" | "shot-removed"; shot: string; index: number }
  | { kind: "shot-changed"; shot: string; index: number; fields: FieldChange[] }
  | { kind: "line-changed"; line: string; before: string; after: string }
  | { kind: "line-added" | "line-removed"; line: string; text: string }
  | { kind: "music-changed"; fields: string[] };

// The shot fields worth telling, in the order they are told. dur is end - start.
export const SHOT_FIELDS = ["dur", "name", "style", "assets", "transition_in", "motion_note"] as const;
const MUSIC_FIELDS = ["file", "start", "end", "media_start", "gain", "fade_in", "fade_out"];

const round2 = (x: number): number => Math.round(x * 100) / 100;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fieldOf = (s: ShotLike, f: string): unknown => (f === "dur" ? round2(Number(s.end) - Number(s.start)) : s[f]);

export function manifestDiff(before: ManifestLike, after: ManifestLike): Change[] {
  const out: Change[] = [];
  const bShots = before.shots ?? [], aShots = after.shots ?? [];
  const bById = new Map(bShots.map((s) => [s.id, s]));
  const aIds = new Set(aShots.map((s) => s.id));

  // Shots in the order of the new timeline; a removed shot goes where it used to be.
  const shotChanges: { at: number; c: Change }[] = [];
  aShots.forEach((s, index) => {
    const was = bById.get(s.id);
    if (!was) { shotChanges.push({ at: index, c: { kind: "shot-added", shot: s.id, index } }); return; }
    const fields = SHOT_FIELDS.map((f) => ({ field: f, before: fieldOf(was, f), after: fieldOf(s, f) })).filter((x) => !same(x.before, x.after));
    if (fields.length) shotChanges.push({ at: index, c: { kind: "shot-changed", shot: s.id, index, fields } });
  });
  bShots.forEach((s, index) => {
    if (!aIds.has(s.id)) shotChanges.push({ at: index - 0.5, c: { kind: "shot-removed", shot: s.id, index } });
  });
  out.push(...shotChanges.sort((x, y) => x.at - y.at).map((x) => x.c));

  const bLines = new Map((before.lines ?? []).map((l) => [l.id, l]));
  const aLineIds = new Set((after.lines ?? []).map((l) => l.id));
  for (const l of after.lines ?? []) {
    const was = bLines.get(l.id);
    if (!was) out.push({ kind: "line-added", line: l.id, text: l.text ?? "" });
    else if ((was.text ?? "") !== (l.text ?? "")) out.push({ kind: "line-changed", line: l.id, before: was.text ?? "", after: l.text ?? "" });
  }
  for (const l of before.lines ?? []) if (!aLineIds.has(l.id)) out.push({ kind: "line-removed", line: l.id, text: l.text ?? "" });

  // Music: one entry naming each bed that was added, removed or changed ("bgm-news: gain").
  const bMusic = new Map((before.music ?? []).map((m) => [m.id, m]));
  const aMusic = new Map((after.music ?? []).map((m) => [m.id, m]));
  const music: string[] = [];
  for (const [id, m] of aMusic) {
    const was = bMusic.get(id);
    if (!was) { music.push(`${id}: thêm`); continue; }
    const f = MUSIC_FIELDS.filter((k) => !same(was[k], m[k]));
    if (f.length) music.push(`${id}: ${f.join(", ")}`);
  }
  for (const id of bMusic.keys()) if (!aMusic.has(id)) music.push(`${id}: bỏ`);
  if (music.length) out.push({ kind: "music-changed", fields: music });
  return out;
}

// The two manifests of a snapshot diff entry for project.json, or null when either side is
// missing or does not parse.
export function parsePair(before: string | null, after: string | null): [ManifestLike, ManifestLike] | null {
  try {
    if (before == null || after == null) return null;
    return [JSON.parse(before) as ManifestLike, JSON.parse(after) as ManifestLike];
  } catch { return null; }
}

// ---- words ---------------------------------------------------------------------------------------
const secs = (x: unknown): string => `${Number(x).toFixed(1).replace(".", ",")} s`;
const quote = (s: unknown, n = 60): string => {
  const t = String(s ?? "");
  return `“${t.length > n ? `${t.slice(0, n - 1)}…` : t}”`;
};
const plain = (x: unknown): string => (x == null || x === "" ? "không có" : String(x));

const FIELD_TEXT: Record<string, (f: FieldChange) => string> = {
  dur: (f) => `dài ${secs(f.before)} → ${secs(f.after)}`,
  name: (f) => `đổi tên ${quote(f.before, 40)} → ${quote(f.after, 40)}`,
  style: (f) => `đổi phong cách ${plain(f.before)} → ${plain(f.after)}`,
  assets: () => "đổi nguồn hình",
  transition_in: (f) => `đổi chuyển cảnh ${plain(f.before)} → ${plain(f.after)}`,
  motion_note: () => "đổi ghi chú chuyển động",
};

// One change in a sentence: "Shot 3 dài 2,0 s → 3,5 s", "Câu vo-04: “…” → “…”".
export function changeText(c: Change): string {
  switch (c.kind) {
    case "shot-added": return `Thêm shot ${c.index + 1}`;
    case "shot-removed": return `Bỏ shot ${c.index + 1} của bản cũ (${c.shot})`;
    case "shot-changed": return `Shot ${c.index + 1} ${c.fields.map((f) => (FIELD_TEXT[f.field] ?? (() => `đổi ${f.field}`))(f)).join("; ")}`;
    case "line-changed": return `Câu ${c.line}: ${quote(c.before)} → ${quote(c.after)}`;
    case "line-added": return `Thêm câu ${c.line}: ${quote(c.text)}`;
    case "line-removed": return `Bỏ câu ${c.line}: ${quote(c.text)}`;
    case "music-changed": return `Nhạc: ${c.fields.join("; ")}`;
  }
}
