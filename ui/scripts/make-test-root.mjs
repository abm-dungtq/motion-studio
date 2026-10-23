// ui/scripts/make-test-root.mjs <root>
// Builds a throwaway Studio root under /tmp from copies of real workspace projects:
// thuy-mau-demo (editable), abm-intro (read-only), viet-pro-intro (no project.json yet),
// perf-60 (thuy-mau-demo stretched to 60 one-second shots), plus scripts/ and shared-assets/.
// The sources in /Volumes/2/Edit-Video are only read, never written.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

const WORKSPACE = "/Volumes/2/Edit-Video";
const PROJECTS = ["thuy-mau-demo", "abm-intro", "viet-pro-intro"];
const SKIP = new Set(["node_modules", ".git", "renders", ".hyperframes"]);

const root = process.argv[2];
if (!root || !/^\/tmp\/ms-react-root-\d+$/.test(root)) {
  console.error("usage: make-test-root.mjs /tmp/ms-react-root-<port>");
  process.exit(2);
}
if (existsSync(root)) {
  console.error(`${root} đã có. Xoá trước nếu muốn tạo lại: rm -rf ${root}`);
  process.exit(3);
}

const filter = (src) => !src.split(sep).some((part) => SKIP.has(part));
const copy = (src, dst) => {
  if (!existsSync(src)) throw new Error(`không có ${src}`);
  cpSync(src, dst, { recursive: true, filter });
};

try {
  mkdirSync(root, { recursive: true });
  for (const name of PROJECTS) copy(join(WORKSPACE, name), join(root, name));

  // perf-60: same media as thuy-mau-demo, 60 shots of 1 s each.
  const perf = join(root, "perf-60");
  copy(join(WORKSPACE, "thuy-mau-demo"), perf);
  const manifestPath = join(perf, "project.json");
  const p = JSON.parse(readFileSync(manifestPath, "utf8"));
  const oldShots = p.shots;
  const first = oldShots[0];
  const shots = Array.from({ length: 60 }, (_, i) => ({ ...first, id: `s${i + 1}`, name: `Shot ${i + 1}`, start: i, end: i + 1 }));
  const shotAt = (t) => shots.find((s) => t >= s.start && t < s.end) ?? shots[shots.length - 1];
  const round3 = (n) => Math.round(n * 1000) / 1000;
  p.shots = shots;
  p.duration = 60;
  p.lines = (p.lines ?? []).map((l) => ({ ...l, shot: shotAt(l.start).id }));
  p.events = (p.events ?? []).map((e) => {
    const old = oldShots.find((s) => s.id === e.shot);
    if (!old) throw new Error(`SFX ${e.id} trỏ tới shot không có: ${e.shot}`);
    const t = old.start + e.offset;
    const s = shotAt(t);
    return { ...e, shot: s.id, offset: round3(t - s.start) };
  });
  writeFileSync(manifestPath, JSON.stringify(p, null, 2) + "\n");

  // new-project.sh and compress-final.sh resolve the root from their own location.
  copy(join(WORKSPACE, "scripts"), join(root, "scripts"));
  copy(join(WORKSPACE, "shared-assets"), join(root, "shared-assets"));
  mkdirSync(join(root, "shared-assets", "sfx"), { recursive: true });
  cpSync(join(root, "thuy-mau-demo", "assets", "sfx", "brush.mp3"), join(root, "shared-assets", "sfx", "thu-brush.mp3"));

  // runner mcp: director requests stay queued instead of starting `claude -p`.
  writeFileSync(join(root, "studio.json"), JSON.stringify({ director: { runner: "mcp" } }, null, 2) + "\n");
  mkdirSync(join(root, "footage", "raw"), { recursive: true });
} catch (e) {
  console.error(`lỗi: ${e.message}. Gốc thử dở dang, xoá bằng: rm -rf ${root}`);
  process.exit(1);
}
console.log(`ok ${root}`);
