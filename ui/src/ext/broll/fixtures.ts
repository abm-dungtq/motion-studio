// Test data only: answers of GET /api/broll/search, /plan and /suggest in the shape the routes
// give them (routes/broll.mjs, lib/broll/suggest.mjs), trimmed. No component imports this.
export const HIT = {
  path: "/Volumes/x/pitch/2.mp4", sha256: "ab12", start: 0, end: 3, duration: 3, shot_type: "trung",
  caption_vi: "Nút bấm màu tím có chữ 'Tạo video mới'", tags: ["nút", "tím"], thumb: "/api/broll/thumb?x=1",
};
export const PLAN = { files: 6, clips: 0, new_files: 6, shots_pending: 0, sheets: 0, calls: 0, settings: { vision: true, max_calls_per_run: 20 } };
export const SUGGEST = {
  query: "song nuoc lieu", duration: 5.5,
  items: [
    { ...HIT, sha256: "s1", start: 0, end: 3, need_stretch: true, use: { start: 0, end: 3 } },
    { ...HIT, sha256: "s2", start: 10, end: 18, need_stretch: false, use: { start: 10, end: 15.5 } },
  ],
};
