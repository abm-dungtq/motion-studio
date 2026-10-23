// lib/quality/basic.mjs — the two checks every output gets: the file is there and not empty, and
// ffprobe can read a media file (image, video, audio).
import { statSync } from "node:fs";
import { probe } from "../../media.mjs";

export const CHECKS = [
  {
    id: "exists-nonempty",
    applies: () => true,
    run(file) {
      const st = statSync(file, { throwIfNoEntry: false });
      if (!st) return { pass: false, detail: "không có file" };
      if (!st.isFile()) return { pass: false, detail: "không phải file thường" };
      return st.size > 0 ? { pass: true, detail: `${st.size} byte` } : { pass: false, detail: "file rỗng (0 byte)" };
    },
  },
  {
    id: "probe-readable",
    applies: (_file, kind) => kind !== "other",
    async run(file) {
      const m = await probe(file);
      if (!m) return { pass: false, detail: "ffprobe không đọc được" };
      return { pass: true, detail: [m.codec, m.width && m.height ? `${m.width}x${m.height}` : null, m.duration ? `${m.duration.toFixed(2)}s` : null].filter(Boolean).join(" ") || "đọc được" };
    },
  },
];
