// lib/quality/image.mjs — image checks of every receipt (lib/quality.mjs). Shared helpers and
// thresholds (studio.json "quality") live in video.mjs; source notes there.
//   alpha-coverage  a PNG with an alpha channel (a cut-out): the share of opaque pixels
//                   (alpha ≥ 128, alphaextract + signalstats) is within [3 %, 97 %]. Below:
//                   all transparent; above: nothing was keyed out. A PNG without alpha is skipped.
//   min-size        the short side is at least 512 px
import { extname } from "node:path";
import { ffmpegLog, probeStreams, thresholds, UNREADABLE } from "./video.mjs";

const ALPHA_FMT = /^(rgba|bgra|argb|abgr|ya|yuva|gbrap|rgba64|bgra64)/;

export const parseYavg = (log) => { const all = [...log.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)]; return all.length ? Number(all.at(-1)[1]) : null; };

export const CHECKS = [
  {
    id: "alpha-coverage", level: "fail",
    applies: (file, kind) => kind === "image" && extname(file).toLowerCase() === ".png",
    async run(file) {
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      if (!ALPHA_FMT.test(String(m.pix_fmt))) return { pass: true, level: "fail", detail: `${m.pix_fmt ?? "?"}: không có kênh alpha, bỏ qua` };
      const t = thresholds();
      const yavg = parseYavg(await ffmpegLog(["-i", file, "-frames:v", "1", "-vf", "alphaextract,lut=y='if(gte(val,128),255,0)',signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"]));
      if (yavg == null) return { pass: false, level: "fail", detail: "không đo được kênh alpha" };
      const pct = Math.round((yavg / 255) * 1000) / 10;
      const why = pct < t.alpha_min_pct ? " (gần như trong suốt hết)" : pct > t.alpha_max_pct ? " (gần như đục hết: tách nền hỏng?)" : "";
      return { pass: pct >= t.alpha_min_pct && pct <= t.alpha_max_pct, level: "fail", detail: `${pct}% điểm đục, cần trong [${t.alpha_min_pct}%, ${t.alpha_max_pct}%]${why}` };
    },
  },
  {
    id: "min-size", level: "fail",
    applies: (_f, kind) => kind === "image",
    async run(file) {
      const m = await probeStreams(file);
      if (!m) return UNREADABLE;
      const t = thresholds();
      const short = Math.min(m.width ?? 0, m.height ?? 0);
      return { pass: short >= t.min_side_px, level: "fail", detail: `${m.width}x${m.height}, cạnh ngắn ${short} px (cần ≥ ${t.min_side_px})` };
    },
  },
];
