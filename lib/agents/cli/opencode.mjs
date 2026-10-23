// lib/agents/cli/opencode.mjs — OpenCode. Checked against v2.0.32:
//   opencode --version                 → "opencode v2.0.32"
//   opencode auth list                 → one row per saved integration, ending "stored"; only the
//                                        rows are counted, nothing of them is kept
//   opencode run [--model p/m] [--file <f>]… <message>   → the answer on stdout
// Reading images through --file is not proven: "unknown" until "Thử khả năng".
import { detectBin, exec } from "../run.mjs";

const run = (io, req, extra, prompt) => exec(io.bin, ["run", ...(req.model ? ["--model", req.model] : []), ...extra, prompt], { cwd: req.cwd, env: io.env, timeout: req.timeout })
  .then((r) => ({ ...r, text: r.stdout }));

export default {
  id: "opencode", label: "OpenCode", rank: 40, bins: ["opencode"],
  caps: { text: "yes", vision: "unknown", image: "no" },
  detect: (io) => detectBin(["opencode"], { env: io.env, parse: (s) => /v?(\d+\.\d+\.\d+)/.exec(s)?.[0] ?? null }),
  async auth(io) {
    const r = await exec(io.bin, ["auth", "list"], { env: io.env, timeout: 10000 });
    if (r.error || r.code !== 0) return { logged_in: null, method: null };
    const n = r.stdout.split("\n").filter((l) => /\bstored\s*$/i.test(l.trim())).length;
    return { logged_in: n > 0, method: n ? `${n} provider` : null };
  },
  run: {
    text: (io, req) => run(io, req, [], req.prompt),
    vision: (io, req) => run(io, req, (req.images ?? []).flatMap((f) => ["--file", f]), req.prompt),
  },
};
