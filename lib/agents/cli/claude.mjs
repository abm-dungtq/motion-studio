// lib/agents/cli/claude.mjs — Claude Code. Checked against 2.1.304:
//   claude --version                    → "2.1.304 (Claude Code)"
//   claude auth status                  → JSON; only Boolean(loggedIn) and authMethod are kept
//                                         (the JSON also holds account and organisation names)
//   claude -p --output-format json      → prompt on stdin; JSON with result
// Vision: the Read tool opens image files, so the images are copied into the run folder and the
// prompt names them; --allowedTools Read keeps every other tool off.
import { detectBin, exec, firstJson } from "../run.mjs";

const result = (r) => {
  const j = firstJson(r.stdout);
  return { ...r, text: typeof j?.result === "string" ? j.result : r.stdout, error: r.error ?? (j?.is_error ? String(j.result ?? "lỗi").slice(0, 300) : null) };
};

export default {
  id: "claude", label: "Claude Code", rank: 10, bins: ["claude"],
  caps: { text: "yes", vision: "yes", image: "no" },
  detect: (io) => detectBin(["claude"], { env: io.env, parse: (s) => /\d+\.\d+\.\d+/.exec(s)?.[0] ?? null }),
  async auth(io) {
    const r = await exec(io.bin, ["auth", "status"], { env: io.env, timeout: 10000 });
    if (r.error) return { logged_in: null, method: null };
    const j = firstJson(r.stdout); // logged out may exit non-zero and still print the JSON
    if (!j || typeof j.loggedIn !== "boolean") return { logged_in: null, method: null };
    return { logged_in: j.loggedIn, method: typeof j.authMethod === "string" ? j.authMethod.slice(0, 40) : null };
  },
  run: {
    text: async (io, req) => result(await exec(io.bin, ["-p", "--output-format", "json", ...(req.model ? ["--model", req.model] : [])], { stdin: req.prompt, cwd: req.cwd, env: io.env, timeout: req.timeout })),
    vision: async (io, req) => result(await exec(io.bin, ["-p", "--output-format", "json", "--allowedTools", "Read", ...(req.model ? ["--model", req.model] : [])], {
      stdin: `${req.prompt}\n\nĐọc các file ảnh này trong thư mục hiện tại bằng tool Read: ${req.images.join(", ")}.`, cwd: req.cwd, env: io.env, timeout: req.timeout,
    })),
  },
};
