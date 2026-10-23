// ui/scripts/seed-gate-cards.mjs <checkout> <projectDir> <direction|animatic>
// Leaves one director request waiting on a gate card, the way tests/studio-gates.test.mjs
// waiting() does: enqueue, claim as "cli", then ask. No real director run is needed.
// Only test roots under /tmp/ms-react-root-* are accepted.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [checkout, projectArg, kind] = process.argv.slice(2);
const QUESTIONS = {
  direction: { kind: "choice", gate: "direction", question: "Chọn hướng?", options: [{ id: "1", label: "Tối giản" }, { id: "2", label: "Rực rỡ" }, { id: "3", label: "Cổ điển" }], artifacts: ["pitch/1.png", "pitch/2.png", "pitch/3.png"] },
  animatic: { kind: "approve", gate: "animatic", question: "Duyệt animatic?", artifacts: ["demo/animatic.mp4"] },
};
if (!checkout || !projectArg || !QUESTIONS[kind]) {
  console.error("usage: seed-gate-cards.mjs <checkout> <projectDir> <direction|animatic>");
  process.exit(2);
}
const dir = resolve(projectArg);
if (!/^\/tmp\/ms-react-root-[^/]+\/[^/]+$/.test(dir)) {
  console.error(`chỉ nhận dự án nằm dưới /tmp/ms-react-root-*: ${dir}`);
  process.exit(2);
}

try {
  const { loadProvider } = await import(pathToFileURL(join(resolve(checkout), "lib/provider.mjs")).href);
  const P = await loadProvider();
  const r = P.requests.enqueue(dir, { scope: "project", base: P.manifest.load(dir).version, text: "Thử thẻ cổng" });
  const claimed = P.requests.next(dir, "cli");
  if (claimed?.id !== r.id) throw new Error(`hàng đợi còn request khác chưa xử lý (nhận ${claimed?.id ?? "không có"}, cần ${r.id})`);
  P.requests.ask(dir, r.id, QUESTIONS[kind]);
  console.log(`seeded ${r.id} ${kind}`);
} catch (e) {
  console.error(`lỗi: ${e.message}`);
  process.exit(1);
}
