// lib/broll/suggest.mjs — B-roll for a shot of a project: the query is the shot's name, its
// motion_note and the words of the voice lines in it, without accents and Vietnamese stopwords.
// The top 5 hits that last at least as long as the shot come first; shorter ones follow with
// need_stretch: true ("cần lặp/chậm"). use: { start, end } is the part to cut.
import { fold } from "../library.mjs";
import { search, tokens } from "./search.mjs";

export const STOPWORDS = new Set(fold("và của là có những các một cho với trong này đó được thì mà như khi để từ ra vào lên xuống không đã đang sẽ rất cũng nhưng nên rồi thôi nữa ở tại theo về bị bởi vì hay hoặc nếu cái chiếc con mình ta chúng tôi bạn họ nó ai gì đây kia ấy thế vậy lại còn chỉ đều cả mỗi shot cảnh").split(/\s+/));

// The words a shot is about (pure).
export function shotQuery(m, shotId) {
  const s = (m?.shots ?? []).find((x) => x.id === shotId);
  if (!s) return null;
  const said = (m.lines ?? []).filter((l) => l.shot === shotId).map((l) => l.text ?? "");
  const words = tokens([s.name, s.motion_note, ...said].filter(Boolean).join(" ")).filter((w) => !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return { shot: s, query: [...new Set(words)].join(" "), duration: Math.max(0, (s.end ?? 0) - (s.start ?? 0)) };
}

// [{ …hit, need_stretch, use: { start, end } }] (pure).
export function suggest(idx, m, shotId, { limit = 5 } = {}) {
  const q = shotQuery(m, shotId);
  if (!q) throw Object.assign(new Error(`không có shot ${shotId}`), { status: 404 });
  if (!q.query) return { query: "", duration: q.duration, items: [] };
  const hits = search(idx, q.query, { limit: 100 });
  const mark = (h) => {
    const fits = h.duration + 1e-6 >= q.duration;
    const end = fits ? Math.min(h.end, h.start + q.duration) : h.end;
    return { ...h, need_stretch: !fits, use: { start: h.start, end: Math.round(end * 1000) / 1000 } };
  };
  const all = hits.map(mark);
  const items = [...all.filter((h) => !h.need_stretch), ...all.filter((h) => h.need_stretch)].slice(0, limit);
  return { query: q.query, duration: q.duration, items };
}
