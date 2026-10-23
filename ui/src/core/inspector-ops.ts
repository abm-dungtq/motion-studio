// Port of the patch building in public/inspector.js (shotView apply, musicView apply, eventView
// apply, wordView apply); behaviour unchanged. Pure functions, no React, so Node runs them too.
// Each answers { ops, error }: error is the toast text of a bad field (shown as an error), and an
// empty ops list without an error means "Không có gì thay đổi".
import { eventStart, type Op } from "./timeline-edit.ts";
import { fmtS, round1 } from "./format.ts";

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export interface OpsOutcome { ops: Op[]; error: string | null }
const fail = (error: string): OpsOutcome => ({ ops: [], error });

interface ShotLike { id: string; start: number; end: number; name?: string; transition_in?: string; motion_note?: string }
interface MusicLike { id: string; start?: number | string | null; end?: number | null; media_start?: number | string | null; gain?: number; fade_in?: number; fade_out?: number }
interface EventLike { id: string; shot: string; offset?: number | string | null; studio?: boolean }
interface ManifestLike { shots: ShotLike[]; events?: EventLike[]; duration?: number }

// The fields of the shot form, as the inputs hold them.
export interface ShotForm { name: string; secs: string | number; transition: string; note: string }

// "Áp dụng" of a shot: set_shot for each changed field, then resize_shot when the length changed.
export function shotOps(m: ManifestLike, id: string, form: ShotForm): OpsOutcome {
  const s = m.shots.find((x) => x.id === id);
  if (!s) return fail("Chọn một shot trên timeline");
  const ops: Op[] = [];
  const n = form.name.trim();
  if (n && n !== s.name) ops.push({ op: "set_shot", id: s.id, field: "name", value: n });
  if (form.transition !== (s.transition_in ?? "")) ops.push({ op: "set_shot", id: s.id, field: "transition_in", value: form.transition });
  if (form.note !== (s.motion_note ?? "")) ops.push({ op: "set_shot", id: s.id, field: "motion_note", value: form.note });
  const d = round1(Number(form.secs));
  if (!(d >= 0.5)) return fail("Số giây tối thiểu là 0,5");
  if (Math.abs(d - (s.end - s.start)) >= 0.05) ops.push({ op: "resize_shot", id: s.id, duration: d });
  return { ops, error: null };
}

// The fields of the music form, as the inputs hold them (gain in %, end blank = to the end).
export interface MusicForm { start: string; end: string; head: string; gain: string; fadeIn: string; fadeOut: string }

// The values the music form starts with.
export function musicForm(b: MusicLike): MusicForm {
  const str = (v: unknown) => (v == null ? "" : String(v));
  return {
    start: str(b.start),
    end: str(b.end),
    head: str(b.media_start ?? 0),
    gain: String(Math.round((b.gain ?? 1) * 100)),
    fadeIn: str(b.fade_in ?? 0),
    fadeOut: str(b.fade_out ?? 0),
  };
}

// "Áp dụng" of a music bed: one update_music with only the fields that changed.
export function musicOps(before: MusicLike, form: MusicForm, total: number): OpsOutcome {
  const s = Number(form.start), ms = Number(form.head), g = Number(form.gain), fi = Number(form.fadeIn), fo = Number(form.fadeOut);
  const e = form.end.trim() === "" ? null : Number(form.end);
  if (![s, ms, g, fi, fo].every(Number.isFinite) || (e !== null && !Number.isFinite(e))) return fail("Nhập số hợp lệ");
  if (s < 0 || ms < 0 || fi < 0 || fo < 0) return fail("Thời gian không được âm");
  if (g < 0 || g > 100) return fail("Âm lượng trong 0–100%");
  if (e !== null && (e > total + 1e-6 || e - s < 0.5)) return fail(`Kết thúc phải sau bắt đầu ít nhất 0,5 giây và không quá ${fmtS(total)}`);
  if (fi + fo > (e ?? total) - s + 1e-6) return fail("Fade vào + fade ra dài hơn khối nhạc");
  const op: Op = { op: "update_music", id: before.id };
  const set = (k: string, val: number | null, was: unknown) => {
    const w = was == null ? null : Number(was);
    if (val === null ? w != null : w == null || Math.abs(val - w) > 1e-6) op[k] = val === null ? null : r3(val);
  };
  set("start", s, before.start);
  set("end", e, before.end ?? null);
  set("media_start", ms, before.media_start ?? 0);
  set("gain", g / 100, before.gain ?? 1);
  set("fade_in", fi, before.fade_in ?? 0);
  set("fade_out", fo, before.fade_out ?? 0);
  return { ops: Object.keys(op).length === 2 ? [] : [op], error: null };
}

// "Áp dụng" of an SFX: move_event to the new time, inside the video.
export function eventOps(m: ManifestLike, id: string, at: string | number): OpsOutcome {
  const e = (m.events ?? []).find((x) => x.id === id);
  if (!e) return fail("Chọn một SFX trên timeline");
  const t = Number(at), total = m.duration || 0;
  if (!Number.isFinite(t) || t < 0 || t > total) return fail(`Thời điểm trong 0–${fmtS(total)}`);
  if (Math.abs(t - eventStart(m, e)) < 1e-6) return { ops: [], error: null };
  return { ops: [{ op: "move_event", id: e.id, start: r3(t) }], error: null };
}

// Studio removes only the SFX it added; the director removes the ones it placed.
export const canDeleteEvent = (ev: { studio?: boolean } | null | undefined): boolean => Boolean(ev?.studio);

// "Áp dụng" of a word marker: the fields that changed, in seconds of the voice file.
export function wordFields(w: { start: number; end: number }, start: string, end: string): { fields: { start?: number; end?: number }; error: string | null } {
  const s = Number(start), e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return { fields: {}, error: "Nhập số hợp lệ" };
  const fields: { start?: number; end?: number } = {};
  if (Math.abs(s - w.start) > 1e-6) fields.start = s;
  if (Math.abs(e - w.end) > 1e-6) fields.end = e;
  return { fields, error: null };
}
