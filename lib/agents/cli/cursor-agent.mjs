// lib/agents/cli/cursor-agent.mjs — Cursor's agent CLI. Not on the machine this was written on,
// so the calls are the documented ones and unverified here:
//   cursor-agent --version
//   cursor-agent status                → "Logged in as …" when logged in (only the match is kept)
//   cursor-agent -p <prompt> --output-format json   → { result, … }
import { detectBin, exec, firstJson } from "../run.mjs";

export default {
  id: "cursor-agent", label: "Cursor Agent", rank: 50, bins: ["cursor-agent"],
  caps: { text: "yes", vision: "unknown", image: "no" },
  detect: (io) => detectBin(["cursor-agent"], { env: io.env }),
  async auth(io) {
    const r = await exec(io.bin, ["status"], { env: io.env, timeout: 10000 });
    if (r.error) return { logged_in: null, method: null };
    const out = `${r.stdout}\n${r.stderr}`;
    if (/not logged in/i.test(out)) return { logged_in: false, method: null };
    return { logged_in: /logged in/i.test(out) ? true : null, method: null };
  },
  run: {
    text: async (io, req) => {
      const r = await exec(io.bin, ["-p", req.prompt, "--output-format", "json", ...(req.model ? ["--model", req.model] : [])], { cwd: req.cwd, env: io.env, timeout: req.timeout });
      const j = firstJson(r.stdout);
      return { ...r, text: typeof j?.result === "string" ? j.result : r.stdout };
    },
  },
};
