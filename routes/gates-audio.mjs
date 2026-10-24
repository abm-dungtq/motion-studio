// routes/gates-audio.mjs — the "hear it again" card of the final gate. When the sound changed after
// the approved animatic while the picture did not (a line voiced again), the provider's final
// preflight only warns ("tiếng đã đổi sau animatic"; GET /api/gates answers audio_changed: true).
// The user measures the mix, listens, then confirms; the provider records that confirmation
// against the current sound (make-demo --record-audio-review), so the hash stays the plugin's.
//   POST /api/gates/audio-check { name }
//        → { level, line, code, tail }: the provider's mixBalance command on the project as its
//          "audio-check" job, waited for (no credit spent). level is PASS, WARN or FAIL of its
//          summary line ("nhạc dưới giọng X dB"; the target is 4–7 dB), null when there is none.
//   POST /api/gates/audio-review { name }
//        → { line }: the user's "Nghe rồi, được": the provider's demo command with
//          --record-audio-review user@studio writes the audio_review: line of DEMO.md; a receipt
//          (op audio-review).
import { join } from "node:path";
import { runFile } from "../create.mjs";
import { BY } from "../gates.mjs";
import { startJob } from "../jobs.mjs";
import { writeReceipt } from "../lib/receipts.mjs";

export const CHECK_KIND = "audio-check";
const REVIEW_TIMEOUT_MS = 60000;
const SUMMARY = /^(PASS|WARN|FAIL) BALANCE\b.*$/;
const bad = (status, msg) => Object.assign(new Error(msg), { status });

function projectOf(c, name) {
  const pd = c.withManifest(name);
  if (pd.error) throw bad(pd.status, pd.error);
  return pd.dir;
}

// The summary of a mix-balance run: { level, line } of its last PASS/WARN/FAIL BALANCE line.
export function balanceSummary(lines) {
  const line = [...lines].reverse().map((l) => String(l).trim()).find((l) => SUMMARY.test(l)) ?? null;
  return { level: line ? line.match(SUMMARY)[1] : null, line };
}

// Starts the job and resolves with the job view when it ends.
function runCheck(name, cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    try {
      startJob({ name, kind: CHECK_KIND, cmd, args, cwd, meta: { step: CHECK_KIND }, onExit: resolve });
    } catch (e) {
      reject(bad(e.code === "BUSY" ? 409 : 500, e.code === "BUSY" ? `${name} đang đo tiếng, chờ xong đã` : e.message));
    }
  });
}

export const ROUTES = [
  {
    method: "POST", path: "/api/gates/audio-check",
    async handler(c) {
      const b = c.body ?? {};
      const dir = projectOf(c, b.name);
      const script = c.P.commands?.mixBalance;
      if (!script) throw bad(400, "provider chưa có lệnh mixBalance; cập nhật plugin rồi thử lại");
      const j = await runCheck(b.name, process.execPath, [script, "--project", dir], dir);
      const tail = j.tail ?? [];
      return { ...balanceSummary(tail), code: j.code, tail: tail.slice(-6) };
    },
  },
  {
    method: "POST", path: "/api/gates/audio-review",
    async handler(c) {
      const b = c.body ?? {};
      const dir = projectOf(c, b.name);
      const t0 = new Date();
      const r = await runFile(process.execPath, [c.P.commands.demo, "--project", dir, "--record-audio-review", BY], { cwd: dir, timeout: REVIEW_TIMEOUT_MS });
      const out = String(r.stderr || r.stdout).trim().split("\n").filter(Boolean);
      if (r.code !== 0) throw bad(r.code === 2 ? 400 : 500, `make-demo --record-audio-review lỗi (exit ${r.code}): ${out.slice(-2).join(" | ")}`);
      await writeReceipt(dir, { op: "audio-review", actor: "human", params: { by: BY }, inputs: { exit: r.code }, outputs: [join(dir, "DEMO.md")], started: t0, ended: new Date() });
      return { line: out.at(-1) ?? null };
    },
  },
];
